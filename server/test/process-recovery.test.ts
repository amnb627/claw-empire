import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { applyBaseSchema } from "../modules/bootstrap/schema/base-schema.ts";
import { reconcileOrphanedProcesses } from "../modules/workflow/agents/process-recovery.ts";

// ---------------------------------------------------------------------------
// active_cli_processes — schema, CRUD, and reconciliation
// ---------------------------------------------------------------------------
describe("active_cli_processes table", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    const tmpPath = path.join(
      os.tmpdir(),
      `claw-pid-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
    );
    db = new DatabaseSync(tmpPath);
    db.exec("PRAGMA foreign_keys = OFF"); // disable FK so we can insert without tasks
    applyBaseSchema(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  it("active_cli_processes table exists after applyBaseSchema", () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='active_cli_processes'",
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("active_cli_processes");
  });

  it("idx_active_cli_processes_pid index exists", () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_active_cli_processes_pid'",
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("idx_active_cli_processes_pid");
  });

  it("insert and delete a row works correctly", () => {
    db.prepare(
      "INSERT INTO active_cli_processes (task_id, pid, provider, worktree_path) VALUES (?, ?, ?, ?)",
    ).run("task-001", 12345, "claude", "/some/path");

    const inserted = db
      .prepare("SELECT * FROM active_cli_processes WHERE task_id = ?")
      .get("task-001") as { task_id: string; pid: number; provider: string } | undefined;

    expect(inserted?.task_id).toBe("task-001");
    expect(inserted?.pid).toBe(12345);
    expect(inserted?.provider).toBe("claude");

    db.prepare("DELETE FROM active_cli_processes WHERE task_id = ?").run("task-001");

    const deleted = db
      .prepare("SELECT * FROM active_cli_processes WHERE task_id = ?")
      .get("task-001");
    expect(deleted).toBeUndefined();
  });

  it("INSERT OR REPLACE upserts correctly", () => {
    db.prepare(
      "INSERT OR REPLACE INTO active_cli_processes (task_id, pid, provider) VALUES (?, ?, ?)",
    ).run("task-002", 11111, "codex");

    db.prepare(
      "INSERT OR REPLACE INTO active_cli_processes (task_id, pid, provider) VALUES (?, ?, ?)",
    ).run("task-002", 22222, "codex");

    const row = db
      .prepare("SELECT pid FROM active_cli_processes WHERE task_id = ?")
      .get("task-002") as { pid: number } | undefined;
    expect(row?.pid).toBe(22222);
  });
});

// ---------------------------------------------------------------------------
// reconcileOrphanedProcesses — clears the table and resets task status
// ---------------------------------------------------------------------------
describe("reconcileOrphanedProcesses", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    const tmpPath = path.join(
      os.tmpdir(),
      `claw-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
    );
    db = new DatabaseSync(tmpPath);
    db.exec("PRAGMA foreign_keys = OFF");
    applyBaseSchema(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  it("returns immediately when no orphaned processes exist", async () => {
    await expect(reconcileOrphanedProcesses(db)).resolves.toBeUndefined();

    const count = db
      .prepare("SELECT COUNT(*) AS c FROM active_cli_processes")
      .get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("clears active_cli_processes table after reconciliation", async () => {
    // Insert rows with a PID that is surely dead (PID 1 is OS-level; signal 0
    // may or may not throw, so use a clearly invalid PID like 2147483647).
    db.prepare(
      "INSERT INTO active_cli_processes (task_id, pid, provider) VALUES (?, ?, ?)",
    ).run("task-orphan-1", 2147483647, "claude");
    db.prepare(
      "INSERT INTO active_cli_processes (task_id, pid, provider) VALUES (?, ?, ?)",
    ).run("task-orphan-2", 2147483646, "codex");

    await reconcileOrphanedProcesses(db);

    const count = db
      .prepare("SELECT COUNT(*) AS c FROM active_cli_processes")
      .get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("resets in_progress tasks to inbox status for orphaned entries", async () => {
    // Insert a task in in_progress status
    db.prepare(
      `INSERT INTO tasks (id, title, status, workflow_pack_key, created_at, updated_at)
       VALUES (?, ?, 'in_progress', 'development', ?, ?)`,
    ).run("task-rp-1", "Orphaned Task", Date.now(), Date.now());

    db.prepare(
      "INSERT INTO active_cli_processes (task_id, pid, provider) VALUES (?, ?, ?)",
    ).run("task-rp-1", 2147483645, "claude");

    await reconcileOrphanedProcesses(db);

    const task = db
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get("task-rp-1") as { status: string } | undefined;
    expect(task?.status).toBe("inbox");
  });

  it("does not touch tasks that are not in_progress", async () => {
    db.prepare(
      `INSERT INTO tasks (id, title, status, workflow_pack_key, created_at, updated_at)
       VALUES (?, ?, 'done', 'development', ?, ?)`,
    ).run("task-done-1", "Done Task", Date.now(), Date.now());

    db.prepare(
      "INSERT INTO active_cli_processes (task_id, pid, provider) VALUES (?, ?, ?)",
    ).run("task-done-1", 2147483644, "claude");

    await reconcileOrphanedProcesses(db);

    const task = db
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get("task-done-1") as { status: string } | undefined;
    // Status should remain 'done', not changed to 'inbox'
    expect(task?.status).toBe("done");
  });
});
