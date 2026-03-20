/**
 * Tests for:
 *   1. RunCompleteHandlerDeps — typed interface key-property shape
 *   2. Linear task chaining — chain_to_task_id triggers pending→planned promotion
 */

import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createRunCompleteHandler } from "./run-complete-handler.ts";
import type { RunCompleteHandlerDeps } from "./run-complete-handler.ts";

// ---------------------------------------------------------------------------
// Minimal in-memory DB with chain_to_task_id support
// ---------------------------------------------------------------------------
function createDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      task_type TEXT,
      priority INTEGER DEFAULT 0,
      workflow_pack_key TEXT,
      project_id TEXT,
      project_path TEXT,
      source_task_id TEXT,
      assigned_agent_id TEXT,
      department_id TEXT,
      result TEXT,
      chain_to_task_id TEXT,
      updated_at INTEGER DEFAULT 0
    );

    CREATE TABLE subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL,
      target_department_id TEXT,
      delegated_task_id TEXT,
      cli_tool_use_id TEXT,
      completed_at INTEGER,
      blocked_reason TEXT
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT,
      name_ko TEXT,
      role TEXT NOT NULL DEFAULT 'junior',
      status TEXT,
      current_task_id TEXT,
      department_id TEXT,
      stats_tasks_done INTEGER DEFAULT 0,
      stats_xp INTEGER DEFAULT 0
    );

    CREATE TABLE review_revision_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      normalized_note TEXT NOT NULL,
      raw_note TEXT NOT NULL,
      first_round INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()*1000)
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_chain ON tasks(chain_to_task_id);
  `);
  return db;
}

function createDeps(db: DatabaseSync, logsDir = "/tmp"): RunCompleteHandlerDeps {
  return {
    activeProcesses: new Map(),
    stopProgressTimer: vi.fn(),
    db,
    stopRequestedTasks: new Set(),
    stopRequestModeByTask: new Map(),
    appendTaskLog: vi.fn(),
    clearTaskWorkflowState: vi.fn(),
    codexThreadToSubtask: new Map(),
    nowMs: () => 1700000000000,
    logsDir,
    broadcast: vi.fn(),
    processSubtaskDelegations: vi.fn(),
    taskWorktrees: new Map(),
    cleanupWorktree: vi.fn(),
    findTeamLeader: vi.fn(() => null),
    getAgentDisplayName: vi.fn(() => "Team Lead"),
    pickL: (pool: unknown) => {
      if (Array.isArray((pool as any)?.ko)) return (pool as any).ko[0];
      if (Array.isArray((pool as any)?.en)) return (pool as any).en[0];
      if (Array.isArray(pool)) return (pool as any[])[0];
      return "";
    },
    l: (ko, en, ja?, zh?) => ({ ko, en, ja: ja ?? en, zh: zh ?? en }),
    notifyCeo: vi.fn(),
    sendAgentMessage: vi.fn(),
    resolveLang: vi.fn(() => "en"),
    formatTaskSubtaskProgressSummary: vi.fn(() => ""),
    crossDeptNextCallbacks: new Map(),
    recoverCrossDeptQueueAfterMissingCallback: vi.fn(),
    subtaskDelegationCallbacks: new Map(),
    finishReview: vi.fn(),
    reconcileDelegatedSubtasksAfterRun: vi.fn(),
    completeTaskWithoutReview: vi.fn(),
    isReportDesignCheckpointTask: vi.fn(() => false),
    extractReportDesignParentTaskId: vi.fn(() => null),
    resumeReportAfterDesignCheckpoint: vi.fn(),
    isPresentationReportTask: vi.fn(() => false),
    readReportFlowValue: vi.fn(() => null),
    startReportDesignCheckpoint: vi.fn(() => false),
    upsertReportFlowValue: vi.fn((desc: string | null) => desc ?? ""),
    isReportRequestTask: vi.fn(() => false),
    notifyTaskStatus: vi.fn(),
    prettyStreamJson: vi.fn((raw: string) => raw),
    getWorktreeDiffSummary: vi.fn(() => ""),
    hasVisibleDiffSummary: vi.fn(() => false),
  };
}

// ---------------------------------------------------------------------------
// Type-safety: RunCompleteHandlerDeps interface shape assertions
// ---------------------------------------------------------------------------
describe("RunCompleteHandlerDeps interface type-safety", () => {
  it("db property is typed as DatabaseSync (has prepare method)", () => {
    const db = createDb();
    try {
      const deps = createDeps(db);
      // If the type is correct, TypeScript enforces DatabaseSync shape at compile time.
      // At runtime, verify the assigned value actually has prepare().
      expect(typeof deps.db.prepare).toBe("function");
    } finally {
      db.close();
    }
  });

  it("broadcast has the correct (type, payload) => void signature", () => {
    const db = createDb();
    try {
      const deps = createDeps(db);
      // Should accept two arguments and return void
      let called = false;
      const testDeps: RunCompleteHandlerDeps = {
        ...deps,
        broadcast: (type: string, payload: unknown) => {
          expect(typeof type).toBe("string");
          called = true;
        },
      };
      testDeps.broadcast("test_event", { id: "123" });
      expect(called).toBe(true);
    } finally {
      db.close();
    }
  });

  it("stopRequestedTasks is a Set<string>", () => {
    const db = createDb();
    try {
      const deps = createDeps(db);
      expect(deps.stopRequestedTasks).toBeInstanceOf(Set);
      deps.stopRequestedTasks.add("task-1");
      expect(deps.stopRequestedTasks.has("task-1")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("stopRequestModeByTask is a Map<string, 'pause'|'cancel'>", () => {
    const db = createDb();
    try {
      const deps = createDeps(db);
      expect(deps.stopRequestModeByTask).toBeInstanceOf(Map);
      deps.stopRequestModeByTask.set("task-1", "pause");
      expect(deps.stopRequestModeByTask.get("task-1")).toBe("pause");
    } finally {
      db.close();
    }
  });

  it("crossDeptNextCallbacks is a Map<string, () => void>", () => {
    const db = createDb();
    try {
      const deps = createDeps(db);
      expect(deps.crossDeptNextCallbacks).toBeInstanceOf(Map);
      let fired = false;
      deps.crossDeptNextCallbacks.set("task-1", () => { fired = true; });
      deps.crossDeptNextCallbacks.get("task-1")!();
      expect(fired).toBe(true);
    } finally {
      db.close();
    }
  });

  it("nowMs returns a number", () => {
    const db = createDb();
    try {
      const deps = createDeps(db);
      const t = deps.nowMs();
      expect(typeof t).toBe("number");
    } finally {
      db.close();
    }
  });
});

// ---------------------------------------------------------------------------
// chain_to_task_id schema
// ---------------------------------------------------------------------------
describe("chain_to_task_id column", () => {
  it("tasks table has chain_to_task_id column", () => {
    const db = createDb();
    try {
      const cols = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
      const names = cols.map((c) => c.name);
      expect(names).toContain("chain_to_task_id");
    } finally {
      db.close();
    }
  });

  it("task can be created with chain_to_task_id set to another task id", () => {
    const db = createDb();
    try {
      db.prepare(
        "INSERT INTO tasks (id, title, status) VALUES ('source-1', 'Source Task', 'in_progress')",
      ).run();
      db.prepare(
        "INSERT INTO tasks (id, title, status, chain_to_task_id) VALUES ('chain-1', 'Chained Task', 'pending', 'source-1')",
      ).run();
      const row = db
        .prepare("SELECT chain_to_task_id FROM tasks WHERE id = 'chain-1'")
        .get() as { chain_to_task_id: string };
      expect(row.chain_to_task_id).toBe("source-1");
    } finally {
      db.close();
    }
  });

  it("chain_to_task_id = null does not affect unrelated tasks", () => {
    const db = createDb();
    try {
      db.prepare(
        "INSERT INTO tasks (id, title, status, chain_to_task_id) VALUES ('normal-1', 'Normal Task', 'inbox', NULL)",
      ).run();
      const row = db
        .prepare("SELECT chain_to_task_id FROM tasks WHERE id = 'normal-1'")
        .get() as { chain_to_task_id: string | null };
      expect(row.chain_to_task_id).toBeNull();
    } finally {
      db.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Linear task chaining — completion handler
// ---------------------------------------------------------------------------
describe("linear task chaining via run-complete-handler", () => {
  it("when source task has no team leader (auto-approve), chained task moves to 'planned'", () => {
    const db = createDb();
    try {
      // Source task (will be completed)
      db.prepare(
        `INSERT INTO tasks (id, title, description, status, workflow_pack_key, source_task_id, assigned_agent_id, department_id, result, updated_at)
         VALUES ('source-task', 'Draft Email', 'Write a draft', 'in_progress', 'development', NULL, 'agent-1', 'dev', 'Here is the draft.', 0)`,
      ).run();

      // Chained task (waiting for source-task to complete)
      db.prepare(
        `INSERT INTO tasks (id, title, description, status, chain_to_task_id, workflow_pack_key, updated_at)
         VALUES ('chained-task', 'Review Email', 'Review the draft', 'pending', 'source-task', 'development', 0)`,
      ).run();

      db.prepare(
        `INSERT INTO agents (id, name, name_ko, role, status, current_task_id, stats_tasks_done, stats_xp)
         VALUES ('agent-1', 'Alice', '앨리스', 'junior', 'working', 'source-task', 0, 0)`,
      ).run();

      const deps = createDeps(db);
      deps.activeProcesses.set("source-task", { pid: 101 });
      // No team leader → finishReview is called immediately (no timeout)
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      // handleTaskRunComplete puts task → review, then schedules setTimeout to call finishReview
      // In tests we use vi.useFakeTimers or rely on the no-leader path which calls finishReview synchronously
      // The no-leader path is:  setTimeout(() => { finishReview(); triggerChain(); }, 2500)
      // We need to advance timers; use vitest fake timers
      vi.useFakeTimers();
      try {
        handleTaskRunComplete("source-task", 0);
        // The outer setTimeout fires in 2500ms, calling finishReview + triggerChainIfNeeded
        vi.advanceTimersByTime(5000);
      } finally {
        vi.useRealTimers();
      }

      const chainedRow = db
        .prepare("SELECT status, description FROM tasks WHERE id = 'chained-task'")
        .get() as { status: string; description: string };

      expect(chainedRow.status).toBe("planned");
      expect(chainedRow.description).toContain("Chained from");
      expect(chainedRow.description).toContain("Draft Email");
    } finally {
      db.close();
    }
  });

  it("chained task description is enriched with previous output summary", () => {
    const db = createDb();
    try {
      db.prepare(
        `INSERT INTO tasks (id, title, description, status, result, workflow_pack_key, assigned_agent_id, updated_at)
         VALUES ('src-2', 'Write Draft', 'Original description', 'in_progress', 'This is the output content.', 'development', 'agent-2', 0)`,
      ).run();
      db.prepare(
        `INSERT INTO tasks (id, title, description, status, chain_to_task_id, workflow_pack_key, updated_at)
         VALUES ('chained-2', 'Edit Draft', 'Please review the draft', 'pending', 'src-2', 'development', 0)`,
      ).run();
      db.prepare(
        `INSERT INTO agents (id, name, name_ko, role, status, current_task_id, stats_tasks_done, stats_xp)
         VALUES ('agent-2', 'Bob', '밥', 'senior', 'working', 'src-2', 0, 0)`,
      ).run();

      const deps = createDeps(db);
      deps.activeProcesses.set("src-2", { pid: 102 });
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      vi.useFakeTimers();
      try {
        handleTaskRunComplete("src-2", 0);
        vi.advanceTimersByTime(5000);
      } finally {
        vi.useRealTimers();
      }

      const row = db
        .prepare("SELECT description FROM tasks WHERE id = 'chained-2'")
        .get() as { description: string };

      expect(row.description).toContain("Chained from");
      expect(row.description).toContain("Write Draft");
      expect(row.description).toContain("This is the output content.");
      expect(row.description).toContain("Please review the draft");
    } finally {
      db.close();
    }
  });

  it("chain_to_task_id = null: normal task completion is unaffected", () => {
    const db = createDb();
    try {
      db.prepare(
        `INSERT INTO tasks (id, title, description, status, workflow_pack_key, assigned_agent_id, updated_at)
         VALUES ('normal-src', 'Normal Task', 'No chain', 'in_progress', 'development', 'agent-3', 0)`,
      ).run();
      db.prepare(
        `INSERT INTO agents (id, name, name_ko, role, status, current_task_id, stats_tasks_done, stats_xp)
         VALUES ('agent-3', 'Carol', '캐롤', 'junior', 'working', 'normal-src', 0, 0)`,
      ).run();

      const deps = createDeps(db);
      const broadcastSpy = vi.fn();
      deps.activeProcesses.set("normal-src", { pid: 103 });
      const depsWithSpy: RunCompleteHandlerDeps = { ...deps, broadcast: broadcastSpy };
      const { handleTaskRunComplete } = createRunCompleteHandler(depsWithSpy);

      vi.useFakeTimers();
      try {
        handleTaskRunComplete("normal-src", 0);
        vi.advanceTimersByTime(5000);
      } finally {
        vi.useRealTimers();
      }

      // No task should have been promoted to 'planned' due to chain
      const chainedRows = db
        .prepare("SELECT id FROM tasks WHERE status = 'planned'")
        .all();
      expect(chainedRows).toHaveLength(0);

      // No chain broadcast should have been emitted
      const chainBroadcasts = broadcastSpy.mock.calls.filter(
        ([type, payload]) => type === "task_update" && (payload as any)?.status === "planned",
      );
      expect(chainBroadcasts).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("broadcast is called with task_update for the chained task when unblocked", () => {
    const db = createDb();
    try {
      db.prepare(
        `INSERT INTO tasks (id, title, status, workflow_pack_key, assigned_agent_id, result, updated_at)
         VALUES ('src-3', 'Step A', 'in_progress', 'development', 'agent-4', 'step A done', 0)`,
      ).run();
      db.prepare(
        `INSERT INTO tasks (id, title, description, status, chain_to_task_id, workflow_pack_key, updated_at)
         VALUES ('chained-3', 'Step B', 'depends on A', 'pending', 'src-3', 'development', 0)`,
      ).run();
      db.prepare(
        `INSERT INTO agents (id, name, name_ko, role, status, current_task_id, stats_tasks_done, stats_xp)
         VALUES ('agent-4', 'Dave', '데이브', 'junior', 'working', 'src-3', 0, 0)`,
      ).run();

      const deps = createDeps(db);
      const broadcastSpy = vi.fn();
      deps.activeProcesses.set("src-3", { pid: 104 });
      const depsWithSpy: RunCompleteHandlerDeps = { ...deps, broadcast: broadcastSpy };
      const { handleTaskRunComplete } = createRunCompleteHandler(depsWithSpy);

      vi.useFakeTimers();
      try {
        handleTaskRunComplete("src-3", 0);
        vi.advanceTimersByTime(5000);
      } finally {
        vi.useRealTimers();
      }

      const chainBroadcasts = broadcastSpy.mock.calls.filter(
        ([type, payload]) => type === "task_update" && (payload as any)?.id === "chained-3",
      );
      expect(chainBroadcasts.length).toBeGreaterThanOrEqual(1);
      expect(chainBroadcasts[0][1]).toMatchObject({ id: "chained-3", status: "planned" });
    } finally {
      db.close();
    }
  });

  it("only pending tasks are unblocked (already planned/done tasks are skipped)", () => {
    const db = createDb();
    try {
      db.prepare(
        `INSERT INTO tasks (id, title, status, workflow_pack_key, assigned_agent_id, result, updated_at)
         VALUES ('src-4', 'Source', 'in_progress', 'development', 'agent-5', 'done output', 0)`,
      ).run();
      // This chained task is already 'planned', not 'pending'
      db.prepare(
        `INSERT INTO tasks (id, title, description, status, chain_to_task_id, workflow_pack_key, updated_at)
         VALUES ('chained-already-planned', 'Already Planned', 'desc', 'planned', 'src-4', 'development', 0)`,
      ).run();
      db.prepare(
        `INSERT INTO agents (id, name, name_ko, role, status, current_task_id, stats_tasks_done, stats_xp)
         VALUES ('agent-5', 'Eve', '이브', 'junior', 'working', 'src-4', 0, 0)`,
      ).run();

      const deps = createDeps(db);
      deps.activeProcesses.set("src-4", { pid: 105 });
      const { handleTaskRunComplete } = createRunCompleteHandler(deps);

      vi.useFakeTimers();
      try {
        handleTaskRunComplete("src-4", 0);
        vi.advanceTimersByTime(5000);
      } finally {
        vi.useRealTimers();
      }

      // Status should remain 'planned' (unchanged), not double-promoted
      const row = db
        .prepare("SELECT status FROM tasks WHERE id = 'chained-already-planned'")
        .get() as { status: string };
      expect(row.status).toBe("planned");
    } finally {
      db.close();
    }
  });
});
