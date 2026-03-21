import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import type { BaseRuntimeContext, RuntimeContext } from "./types/runtime-context.ts";

import { DIST_DIR, IS_PRODUCTION } from "./config/runtime.ts";
import {
  IN_PROGRESS_ORPHAN_GRACE_MS,
  IN_PROGRESS_ORPHAN_SWEEP_MS,
  SQLITE_BUSY_RETRY_BASE_DELAY_MS,
  SQLITE_BUSY_RETRY_JITTER_MS,
  SQLITE_BUSY_RETRY_MAX_ATTEMPTS,
  SQLITE_BUSY_RETRY_MAX_DELAY_MS,
  SUBTASK_DELEGATION_SWEEP_MS,
  initializeDatabaseRuntime,
} from "./db/runtime.ts";
import {
  installSecurityMiddleware,
  isIncomingMessageAuthenticated,
  isIncomingMessageOriginTrusted,
} from "./security/auth.ts";
import { assertRuntimeFunctionsResolved, createDeferredRuntimeProxy } from "./modules/deferred-runtime.ts";
import { ROUTE_RUNTIME_HELPER_KEYS } from "./modules/runtime-helper-keys.ts";
import { startLifecycle } from "./modules/lifecycle.ts";
import { registerApiRoutes } from "./modules/routes.ts";
import { initializeWorkflow } from "./modules/workflow.ts";
import {
  createReadSettingString,
  createRunInTransaction,
  firstQueryValue,
  nowMs,
  sleepMs,
} from "./modules/bootstrap/helpers.ts";
import {
  createMessageIdempotencyTools,
  IdempotencyConflictError,
  StorageBusyError,
} from "./modules/bootstrap/message-idempotency.ts";
import { createSecurityAuditTools } from "./modules/bootstrap/security-audit.ts";
import { applyBaseSchema } from "./modules/bootstrap/schema/base-schema.ts";
import { initializeOAuthRuntime } from "./modules/bootstrap/schema/oauth-runtime.ts";
import { applyTaskSchemaMigrations } from "./modules/bootstrap/schema/task-schema-migrations.ts";
import { applyDefaultSeeds } from "./modules/bootstrap/schema/seeds.ts";
import { reconcileOrphanedProcesses } from "./modules/workflow/agents/process-recovery.ts";
import { initPackRegistry } from "./modules/workflow/packs/definitions.ts";
import { pruneStaleClimpireBranches } from "./modules/workflow/core/worktree/branch-pruner.ts";
import { createAsyncReader } from "./db/async-reader.ts";
import type { AsyncReader } from "./db/async-reader.ts";

export type { TaskCreationAuditInput } from "./modules/bootstrap/security-audit.ts";

const app = express();
installSecurityMiddleware(app);

const { dbPath, db, logsDir } = initializeDatabaseRuntime();
const distDir = DIST_DIR;
const isProduction = IS_PRODUCTION;

// Worker thread pool for read-heavy queries (e.g. GET /api/tasks).
// Each worker opens its own read-only DatabaseSync connection to the WAL file,
// allowing concurrent reads without blocking the main-thread event loop.
let asyncReader: AsyncReader | undefined;
try {
  asyncReader = createAsyncReader(dbPath, 2);
  console.log("[Claw-Empire] AsyncReader: worker pool (2 threads) initialized");
} catch (err) {
  console.warn("[Claw-Empire] AsyncReader: worker pool unavailable, falling back to sync reads:", err);
  asyncReader = undefined;
}

const runInTransaction = createRunInTransaction(db);
const readSettingString = createReadSettingString(db);

applyBaseSchema(db);
const oauthRuntime = initializeOAuthRuntime({ db, nowMs, runInTransaction });
applyTaskSchemaMigrations(db);
applyDefaultSeeds(db);

// Populate the runtime pack registry from DB so user-defined packs are recognized
const _enabledPackRows = db.prepare("SELECT key FROM workflow_packs WHERE enabled = 1").all() as { key: string }[];
initPackRegistry(_enabledPackRows.map((p) => p.key));

const messageIdempotency = createMessageIdempotencyTools({
  db,
  nowMs,
  sleepMs,
  SQLITE_BUSY_RETRY_BASE_DELAY_MS,
  SQLITE_BUSY_RETRY_JITTER_MS,
  SQLITE_BUSY_RETRY_MAX_ATTEMPTS,
  SQLITE_BUSY_RETRY_MAX_DELAY_MS,
});

const securityAudit = createSecurityAuditTools({
  db,
  logsDir,
  nowMs,
  withSqliteBusyRetry: messageIdempotency.withSqliteBusyRetry,
});

const runtimeContext: Record<string, any> & BaseRuntimeContext = {
  app,
  db,
  dbPath,
  logsDir,
  distDir,
  isProduction,
  nowMs,
  runInTransaction,
  firstQueryValue,
  readSettingString,

  IN_PROGRESS_ORPHAN_GRACE_MS,
  IN_PROGRESS_ORPHAN_SWEEP_MS,
  SUBTASK_DELEGATION_SWEEP_MS,

  ensureOAuthActiveAccount: oauthRuntime.ensureOAuthActiveAccount,
  getActiveOAuthAccountIds: oauthRuntime.getActiveOAuthAccountIds,
  setActiveOAuthAccount: oauthRuntime.setActiveOAuthAccount,
  setOAuthActiveAccounts: oauthRuntime.setOAuthActiveAccounts,
  removeActiveOAuthAccount: oauthRuntime.removeActiveOAuthAccount,
  oauthProviderPrefix: oauthRuntime.oauthProviderPrefix,
  normalizeOAuthProvider: oauthRuntime.normalizeOAuthProvider,
  getNextOAuthLabel: oauthRuntime.getNextOAuthLabel,
  isIncomingMessageAuthenticated,
  isIncomingMessageOriginTrusted,

  IdempotencyConflictError,
  StorageBusyError,
  insertMessageWithIdempotency: messageIdempotency.insertMessageWithIdempotency,
  resolveMessageIdempotencyKey: messageIdempotency.resolveMessageIdempotencyKey,
  withSqliteBusyRetry: messageIdempotency.withSqliteBusyRetry,
  recordMessageIngressAuditOr503: securityAudit.recordMessageIngressAuditOr503,
  recordAcceptedIngressAuditOrRollback: securityAudit.recordAcceptedIngressAuditOrRollback,
  recordTaskCreationAudit: securityAudit.recordTaskCreationAudit,
  setTaskCreationAuditCompletion: securityAudit.setTaskCreationAuditCompletion,

  WebSocket,
  WebSocketServer,
  express,

  DEPT_KEYWORDS: {},

  // Worker-thread async reader for non-blocking SELECT queries.
  // Passed through to route handlers that benefit from offloading heavy reads.
  asyncReader,
};

const runtimeProxy = createDeferredRuntimeProxy(runtimeContext);

Object.assign(runtimeContext, initializeWorkflow(runtimeProxy as RuntimeContext));
Object.assign(runtimeContext, registerApiRoutes(runtimeContext as RuntimeContext));

assertRuntimeFunctionsResolved(runtimeContext, ROUTE_RUNTIME_HELPER_KEYS, "route helper wiring");

reconcileOrphanedProcesses(db).catch((err) => {
  console.error("[ProcessRecovery] Error during orphan reconciliation:", err);
});

// On startup, prune stale climpire/* branches for all known projects
{
  const _projectRows = db
    .prepare("SELECT DISTINCT project_path FROM projects WHERE project_path IS NOT NULL")
    .all() as { project_path: string }[];
  for (const { project_path } of _projectRows) {
    pruneStaleClimpireBranches(db, project_path).catch(() => {
      /* non-fatal: branch pruning should not block server startup */
    });
  }
}

// Gracefully close the async reader worker pool on process exit.
// This allows worker threads to finish current queries before termination.
function shutdownAsyncReader() {
  if (asyncReader) {
    asyncReader.close().catch(() => {
      /* non-fatal */
    });
  }
}
process.once("SIGTERM", shutdownAsyncReader);
process.once("SIGINT", shutdownAsyncReader);

startLifecycle(runtimeContext as RuntimeContext);
