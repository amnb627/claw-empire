import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  createDeferredRuntimeFunction,
  createDeferredRuntimeProxy,
  isDeferredRuntimeFunction,
  getDeferredRuntimeFunctionName,
  collectUnresolvedDeferredRuntimeFunctions,
  assertNoUnresolvedDeferredRuntimeFunctions,
} from "../modules/deferred-runtime.ts";
import { authorizeWatcherSubscription, detectPrivilegeEscalation } from "../security/watcher/authorization.ts";
import { MESSENGER_CHANNELS, isMessengerChannel, isNativeMessengerChannel } from "../messenger/channels.ts";

describe("backend test baseline", () => {
  it("runs with node test environment", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// DB initializes cleanly with an in-memory path
// ---------------------------------------------------------------------------
describe("SQLite DB initialization", () => {
  let db: DatabaseSync;
  let tmpPath: string;

  beforeEach(() => {
    tmpPath = path.join(os.tmpdir(), `claw-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
    db = new DatabaseSync(tmpPath);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  it("opens a SQLite database and can execute PRAGMA statements", () => {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    const row = db.prepare("SELECT sqlite_version() AS v").get() as { v: string } | undefined;
    expect(row?.v).toBeTruthy();
    expect(typeof row?.v).toBe("string");
  });

  it("can create a table and insert+query a row", () => {
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("test_key", '{"ok":true}');
    const result = db.prepare("SELECT value FROM settings WHERE key = ?").get("test_key") as
      | { value: string }
      | undefined;
    expect(result?.value).toBe('{"ok":true}');
  });
});

// ---------------------------------------------------------------------------
// Deferred runtime proxy — wiring and error propagation
// ---------------------------------------------------------------------------
describe("deferred runtime proxy", () => {
  it("throws when an uninitialized deferred function is called", () => {
    const runtime: Record<string, unknown> = {};
    const proxy = createDeferredRuntimeProxy(runtime);
    const fn = (proxy as Record<string, unknown>)["uninitializedFn"] as () => void;
    expect(() => fn()).toThrow("uninitializedFn_not_initialized");
  });

  it("forwards calls to the real implementation after wiring", () => {
    const runtime: Record<string, unknown> = {};
    const proxy = createDeferredRuntimeProxy(runtime);
    // Access through proxy to create the deferred stub
    const stubFn = (proxy as Record<string, unknown>)["doWork"] as (...args: unknown[]) => unknown;
    expect(isDeferredRuntimeFunction(stubFn)).toBe(true);

    // Wire in the real implementation
    runtime["doWork"] = (x: unknown) => (x as number) * 2;

    // Now the proxy should delegate
    expect(stubFn(21)).toBe(42);
  });

  it("isDeferredRuntimeFunction returns false for ordinary functions", () => {
    const ordinary = () => 0;
    expect(isDeferredRuntimeFunction(ordinary)).toBe(false);
    expect(isDeferredRuntimeFunction(null)).toBe(false);
    expect(isDeferredRuntimeFunction(undefined)).toBe(false);
  });

  it("getDeferredRuntimeFunctionName returns the registered name", () => {
    const runtime: Record<string, unknown> = {};
    const fn = createDeferredRuntimeFunction(runtime, "myFunc");
    expect(getDeferredRuntimeFunctionName(fn)).toBe("myFunc");
    expect(getDeferredRuntimeFunctionName(() => 0)).toBeNull();
  });

  it("collectUnresolvedDeferredRuntimeFunctions lists only deferred stubs", () => {
    const runtime: Record<string, unknown> = {};
    const proxy = createDeferredRuntimeProxy(runtime);
    // Access two deferred names to create stubs
    void (proxy as Record<string, unknown>)["alpha"];
    void (proxy as Record<string, unknown>)["beta"];
    // Wire one of them
    runtime["alpha"] = () => "done";

    const unresolved = collectUnresolvedDeferredRuntimeFunctions(runtime);
    expect(unresolved).toContain("beta");
    expect(unresolved).not.toContain("alpha");
  });

  it("assertNoUnresolvedDeferredRuntimeFunctions passes when all are wired", () => {
    const runtime: Record<string, unknown> = { doIt: () => "ok" };
    expect(() => assertNoUnresolvedDeferredRuntimeFunctions(runtime, "test")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Watcher authorization — role-based access control
// ---------------------------------------------------------------------------
describe("watcher authorization", () => {
  it("CEO is allowed to subscribe to any resource", () => {
    const result = authorizeWatcherSubscription(
      { userId: "u1", userRole: "ceo", departmentId: null, agentId: null },
      { targetType: "task", targetId: "task-1", events: ["task_update"] },
    );
    expect(result.allowed).toBe(true);
  });

  it("team_leader is denied cross-department task subscription", () => {
    const result = authorizeWatcherSubscription(
      { userId: "u2", userRole: "team_leader", departmentId: "dept-A", agentId: null },
      { targetType: "task", targetId: "task-1", events: ["task_update"], targetDepartmentId: "dept-B" },
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/dept-A/);
  });

  it("agent can only subscribe to their own tasks", () => {
    const ctx = { userId: "u3", userRole: "agent" as const, departmentId: "dept-A", agentId: "agent-99" };
    const allowed = authorizeWatcherSubscription(ctx, {
      targetType: "task",
      targetId: "task-1",
      events: ["task_update"],
      targetAgentId: "agent-99",
    });
    const denied = authorizeWatcherSubscription(ctx, {
      targetType: "task",
      targetId: "task-2",
      events: ["task_update"],
      targetAgentId: "agent-42",
    });
    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
  });

  it("detectPrivilegeEscalation returns a string when role escalation is attempted", () => {
    // Session says "agent" but caller claims "ceo"
    const result = detectPrivilegeEscalation(
      { userId: "u3", userRole: "agent", departmentId: null, agentId: "agent-1" },
      "ceo",
    );
    expect(typeof result).toBe("string");
    expect(result).toMatch(/escalation/i);
  });

  it("detectPrivilegeEscalation returns null when no escalation is detected", () => {
    const result = detectPrivilegeEscalation(
      { userId: "u3", userRole: "agent", departmentId: "dept-A", agentId: "agent-1" },
      "agent",
      "dept-A",
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Messenger channel registry
// ---------------------------------------------------------------------------
describe("messenger channel registry", () => {
  it("MESSENGER_CHANNELS is a non-empty array of strings", () => {
    expect(Array.isArray(MESSENGER_CHANNELS)).toBe(true);
    expect(MESSENGER_CHANNELS.length).toBeGreaterThan(0);
    for (const ch of MESSENGER_CHANNELS) {
      expect(typeof ch).toBe("string");
    }
  });

  it("isMessengerChannel correctly identifies valid and invalid channels", () => {
    expect(isMessengerChannel("telegram")).toBe(true);
    expect(isMessengerChannel("discord")).toBe(true);
    expect(isMessengerChannel("unknown_channel")).toBe(false);
    expect(isMessengerChannel(null)).toBe(false);
    expect(isMessengerChannel(42)).toBe(false);
  });

  it("isNativeMessengerChannel accepts known native channels", () => {
    // telegram and discord are native channels in every config
    expect(isNativeMessengerChannel("telegram")).toBe(true);
    expect(isNativeMessengerChannel("discord")).toBe(true);
  });
});
