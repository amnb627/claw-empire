/**
 * Tests for Agent Project Memory:
 *   1. skill-extractor.ts — extractAndStoreInsights unit tests
 *   2. agent_project_memory schema existence
 *   3. GET /api/projects/:id/memory
 *   4. DELETE /api/projects/:id/memory/:memoryId
 */

import express from "express";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { applyBaseSchema } from "../modules/bootstrap/schema/base-schema.ts";
import { applyTaskSchemaMigrations } from "../modules/bootstrap/schema/task-schema-migrations.ts";
import { extractAndStoreInsights } from "../modules/workflow/agents/skill-extractor.ts";

// ---------------------------------------------------------------------------
// Minimal DB setup for skill-extractor unit tests
// ---------------------------------------------------------------------------
function createMinimalDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_path TEXT NOT NULL DEFAULT '/',
      core_goal TEXT NOT NULL DEFAULT '',
      default_pack_key TEXT NOT NULL DEFAULT 'development',
      created_at INTEGER DEFAULT (unixepoch()*1000),
      updated_at INTEGER DEFAULT (unixepoch()*1000)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      project_id TEXT,
      result TEXT,
      status TEXT NOT NULL DEFAULT 'done',
      workflow_pack_key TEXT NOT NULL DEFAULT 'development',
      created_at INTEGER DEFAULT (unixepoch()*1000),
      updated_at INTEGER DEFAULT (unixepoch()*1000)
    );

    CREATE TABLE IF NOT EXISTS agent_project_memory (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      insight TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general'
        CHECK(category IN ('convention','tool','command','preference','warning','fact','general')),
      source_task_id TEXT,
      confidence INTEGER NOT NULL DEFAULT 5,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()*1000),
      updated_at INTEGER DEFAULT (unixepoch()*1000)
    );
  `);
  return db;
}

function seedProject(db: DatabaseSync): string {
  const projectId = randomUUID();
  db.prepare("INSERT INTO projects (id, name, project_path, core_goal) VALUES (?, ?, ?, ?)").run(
    projectId,
    "Test Project",
    "/tmp/test-project",
    "Test goal",
  );
  return projectId;
}

function seedTask(db: DatabaseSync, projectId: string): string {
  const taskId = randomUUID();
  db.prepare("INSERT INTO tasks (id, title, project_id, result, status) VALUES (?, ?, ?, ?, ?)").run(
    taskId,
    "Implement feature",
    projectId,
    "Completed successfully",
    "done",
  );
  return taskId;
}

// ---------------------------------------------------------------------------
// Unit tests: extractAndStoreInsights
// ---------------------------------------------------------------------------
describe("extractAndStoreInsights", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createMinimalDb();
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  it("returns 0 when projectId is null", () => {
    const stored = extractAndStoreInsights({
      taskId: randomUUID(),
      projectId: null,
      provider: "claude",
      title: "Test task",
      description: null,
      result: "Some result with commands",
      packKey: "development",
      db,
    });
    expect(stored).toBe(0);
  });

  it("returns 0 when result is null", () => {
    const projectId = seedProject(db);
    const stored = extractAndStoreInsights({
      taskId: randomUUID(),
      projectId,
      provider: "claude",
      title: "Test task",
      description: null,
      result: null,
      packKey: "development",
      db,
    });
    expect(stored).toBe(0);
  });

  it("returns 0 when result is empty string", () => {
    const projectId = seedProject(db);
    const stored = extractAndStoreInsights({
      taskId: randomUUID(),
      projectId,
      provider: "claude",
      title: "Test task",
      description: null,
      result: "",
      packKey: "development",
      db,
    });
    expect(stored).toBe(0);
  });

  it("extracts command patterns from result and stores them", () => {
    const projectId = seedProject(db);
    const taskId = seedTask(db, projectId);

    const result = "Here is how I ran it:\n```bash\npnpm run test:api\n```\nAnd it worked fine.";
    const stored = extractAndStoreInsights({
      taskId,
      projectId,
      provider: "claude",
      title: "Run tests",
      description: null,
      result,
      packKey: "development",
      db,
    });

    expect(stored).toBeGreaterThan(0);
    const memories = db
      .prepare("SELECT * FROM agent_project_memory WHERE project_id = ?")
      .all(projectId) as Array<{ insight: string; category: string }>;
    expect(memories.length).toBeGreaterThan(0);
    const commandMemory = memories.find((m) => m.category === "command");
    expect(commandMemory).toBeDefined();
  });

  it("stores insights to DB with correct fields", () => {
    const projectId = seedProject(db);
    const taskId = seedTask(db, projectId);

    extractAndStoreInsights({
      taskId,
      projectId,
      provider: "codex",
      title: "Deploy task",
      description: null,
      result: "```bash\nnpm install\n```\nDependencies installed",
      packKey: "development",
      db,
    });

    const memories = db
      .prepare("SELECT * FROM agent_project_memory WHERE project_id = ? AND provider = 'codex'")
      .all(projectId) as Array<{
      id: string;
      project_id: string;
      provider: string;
      insight: string;
      category: string;
      source_task_id: string;
      confidence: number;
    }>;

    expect(memories.length).toBeGreaterThan(0);
    const memory = memories[0];
    expect(memory.project_id).toBe(projectId);
    expect(memory.provider).toBe("codex");
    expect(typeof memory.insight).toBe("string");
    expect(memory.insight.length).toBeGreaterThan(0);
    expect(memory.confidence).toBeGreaterThanOrEqual(1);
    expect(memory.confidence).toBeLessThanOrEqual(10);
  });

  it("increments confidence on duplicate insight", () => {
    const projectId = seedProject(db);
    const taskId = seedTask(db, projectId);

    const result = "```bash\npnpm run build\n```\nBuild succeeded";

    extractAndStoreInsights({
      taskId,
      projectId,
      provider: "claude",
      title: "Build",
      description: null,
      result,
      packKey: "development",
      db,
    });

    const beforeRows = db
      .prepare("SELECT confidence FROM agent_project_memory WHERE project_id = ?")
      .all(projectId) as Array<{ confidence: number }>;
    expect(beforeRows.length).toBeGreaterThan(0);
    const initialConfidence = beforeRows[0].confidence;

    // Second call with identical result → same insight text → confidence +1
    extractAndStoreInsights({
      taskId,
      projectId,
      provider: "claude",
      title: "Build again",
      description: null,
      result,
      packKey: "development",
      db,
    });

    const afterRows = db
      .prepare("SELECT confidence FROM agent_project_memory WHERE project_id = ?")
      .all(projectId) as Array<{ confidence: number }>;
    expect(afterRows.length).toBe(beforeRows.length); // no new rows added
    expect(afterRows[0].confidence).toBe(initialConfidence + 1);
  });

  it("limits stored insights to 5 per call", () => {
    const projectId = seedProject(db);
    const taskId = seedTask(db, projectId);

    // Craft a result that would generate many patterns:
    // - 3 code blocks (command limit)
    // - 2 convention lines
    // - 2 warning lines
    const result = [
      "```bash\ncmd1 --flag\n```",
      "```bash\ncmd2 --flag\n```",
      "```bash\ncmd3 --flag\n```",
      "The .ts convention: always use TypeScript for new files",
      "The .js pattern: prefer ES modules should be used",
      "⚠️ warning: always check for null before accessing",
      "warning: fixed: make sure to handle errors",
    ].join("\n");

    const stored = extractAndStoreInsights({
      taskId,
      projectId,
      provider: "claude",
      title: "Multi-pattern task",
      description: null,
      result,
      packKey: "development",
      db,
    });

    expect(stored).toBeLessThanOrEqual(5);

    const count = (
      db
        .prepare("SELECT COUNT(*) as cnt FROM agent_project_memory WHERE project_id = ?")
        .get(projectId) as { cnt: number }
    ).cnt;
    expect(count).toBeLessThanOrEqual(5);
  });

  it("stores warning-category insights for lines matching warning patterns", () => {
    const projectId = seedProject(db);
    const taskId = seedTask(db, projectId);

    const result = "fixed: had to use utf-8 encoding to read the file correctly";
    extractAndStoreInsights({
      taskId,
      projectId,
      provider: "claude",
      title: "File read task",
      description: null,
      result,
      packKey: "development",
      db,
    });

    const warnings = db
      .prepare("SELECT * FROM agent_project_memory WHERE project_id = ? AND category = 'warning'")
      .all(projectId) as Array<{ insight: string }>;
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Schema test: agent_project_memory table exists in full DB setup
// ---------------------------------------------------------------------------
describe("agent_project_memory schema", () => {
  it("table exists after applyBaseSchema + applyTaskSchemaMigrations", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyBaseSchema(db);
      applyTaskSchemaMigrations(db);

      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_project_memory'")
        .get() as { name: string } | undefined;
      expect(row?.name).toBe("agent_project_memory");
    } finally {
      db.close();
    }
  });

  it("has the expected columns", () => {
    const db = new DatabaseSync(":memory:");
    try {
      applyBaseSchema(db);
      applyTaskSchemaMigrations(db);

      const cols = db.prepare("PRAGMA table_info(agent_project_memory)").all() as Array<{ name: string }>;
      const colNames = cols.map((c) => c.name);

      expect(colNames).toContain("id");
      expect(colNames).toContain("project_id");
      expect(colNames).toContain("provider");
      expect(colNames).toContain("insight");
      expect(colNames).toContain("category");
      expect(colNames).toContain("source_task_id");
      expect(colNames).toContain("confidence");
      expect(colNames).toContain("use_count");
      expect(colNames).toContain("created_at");
      expect(colNames).toContain("updated_at");
    } finally {
      db.close();
    }
  });
});

// ---------------------------------------------------------------------------
// API tests: GET/DELETE /api/projects/:id/memory
// ---------------------------------------------------------------------------
async function createApiHarness() {
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  applyTaskSchemaMigrations(db);

  const app = express();
  app.use(express.json());

  const { registerProjectRoutes } = await import("../modules/routes/core/projects.ts");
  registerProjectRoutes({
    app,
    db,
    firstQueryValue: (v: unknown) => (Array.isArray(v) ? String(v[0]) : v != null ? String(v) : undefined),
    normalizeTextField: (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null),
    runInTransaction: (fn: () => void) => fn(),
    nowMs: () => Date.now(),
  });

  return { app, db };
}

function insertProjectDirect(db: DatabaseSync): string {
  const id = randomUUID();
  db.prepare("INSERT INTO projects (id, name, project_path, core_goal) VALUES (?, ?, ?, ?)").run(
    id,
    "Test Project",
    "/tmp/test-proj",
    "test",
  );
  return id;
}

function insertMemory(db: DatabaseSync, projectId: string, insight: string): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO agent_project_memory (id, project_id, provider, insight, category, confidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, projectId, "claude", insight, "fact", 7);
  return id;
}

describe("Memory API: GET /api/projects/:id/memory", () => {
  it("returns empty memories array for project with no memories", async () => {
    const { app, db } = await createApiHarness();
    const projectId = insertProjectDirect(db);

    const res = await request(app).get(`/api/projects/${projectId}/memory`).expect(200);
    expect(res.body.memories).toBeDefined();
    expect(Array.isArray(res.body.memories)).toBe(true);
    expect(res.body.memories.length).toBe(0);

    db.close();
  });

  it("returns stored memories for a project", async () => {
    const { app, db } = await createApiHarness();
    const projectId = insertProjectDirect(db);
    insertMemory(db, projectId, "Always use pnpm, not npm");
    insertMemory(db, projectId, "TypeScript strict mode is enabled");

    const res = await request(app).get(`/api/projects/${projectId}/memory`).expect(200);
    expect(res.body.memories.length).toBe(2);

    const insights = res.body.memories.map((m: { insight: string }) => m.insight);
    expect(insights).toContain("Always use pnpm, not npm");
    expect(insights).toContain("TypeScript strict mode is enabled");

    db.close();
  });

  it("returns 404 for non-existent project", async () => {
    const { app, db } = await createApiHarness();
    await request(app).get(`/api/projects/${randomUUID()}/memory`).expect(404);
    db.close();
  });

  it("memory objects include expected fields", async () => {
    const { app, db } = await createApiHarness();
    const projectId = insertProjectDirect(db);
    insertMemory(db, projectId, "Use ESM imports");

    const res = await request(app).get(`/api/projects/${projectId}/memory`).expect(200);
    const memory = res.body.memories[0];
    expect(memory).toHaveProperty("id");
    expect(memory).toHaveProperty("insight");
    expect(memory).toHaveProperty("category");
    expect(memory).toHaveProperty("confidence");
    expect(memory).toHaveProperty("use_count");
    expect(memory).toHaveProperty("created_at");

    db.close();
  });
});

describe("Memory API: DELETE /api/projects/:id/memory/:memoryId", () => {
  it("removes specific memory entry", async () => {
    const { app, db } = await createApiHarness();
    const projectId = insertProjectDirect(db);
    const memoryId = insertMemory(db, projectId, "Use strict TypeScript");

    await request(app).delete(`/api/projects/${projectId}/memory/${memoryId}`).expect(200);

    const row = db
      .prepare("SELECT id FROM agent_project_memory WHERE id = ?")
      .get(memoryId) as { id: string } | undefined;
    expect(row).toBeUndefined();

    db.close();
  });

  it("returns ok:true on successful delete", async () => {
    const { app, db } = await createApiHarness();
    const projectId = insertProjectDirect(db);
    const memoryId = insertMemory(db, projectId, "Some insight");

    const res = await request(app).delete(`/api/projects/${projectId}/memory/${memoryId}`).expect(200);
    expect(res.body.ok).toBe(true);

    db.close();
  });

  it("is idempotent — deleting non-existent memory still returns ok:true", async () => {
    const { app, db } = await createApiHarness();
    const projectId = insertProjectDirect(db);

    const res = await request(app).delete(`/api/projects/${projectId}/memory/${randomUUID()}`).expect(200);
    expect(res.body.ok).toBe(true);

    db.close();
  });

  it("does not delete a memory belonging to a different project", async () => {
    const { app, db } = await createApiHarness();
    const projectId1 = insertProjectDirect(db);
    const projectId2 = insertProjectDirect(db);
    const memoryId = insertMemory(db, projectId1, "Project 1 insight");

    // Try to delete via projectId2 — should not delete
    await request(app).delete(`/api/projects/${projectId2}/memory/${memoryId}`).expect(200);

    const row = db
      .prepare("SELECT id FROM agent_project_memory WHERE id = ?")
      .get(memoryId) as { id: string } | undefined;
    expect(row?.id).toBe(memoryId); // still exists

    db.close();
  });
});
