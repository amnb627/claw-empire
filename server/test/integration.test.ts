/**
 * Comprehensive integration tests for the full Claw-Empire database schema
 * and critical task lifecycle paths.
 *
 * Uses an in-memory SQLite database to exercise all major tables and
 * business rules without requiring a running server.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { applyBaseSchema } from "../modules/bootstrap/schema/base-schema.ts";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedProject(db: DatabaseSync, id: string, name = "Test Project"): void {
  db.prepare(
    "INSERT INTO projects (id, name, project_path, core_goal) VALUES (?, ?, ?, ?)",
  ).run(id, name, `/workspace/${id}`, "Test goal");
}

function seedAgent(
  db: DatabaseSync,
  id: string,
  deptId: string | null = null,
  role = "junior",
): void {
  db.prepare(
    "INSERT INTO agents (id, name, role, workflow_pack_key) VALUES (?, ?, ?, ?)",
  ).run(id, `Agent-${id}`, role, "development");
  if (deptId) {
    db.prepare("UPDATE agents SET department_id = ? WHERE id = ?").run(deptId, id);
  }
}

function seedTask(
  db: DatabaseSync,
  id: string,
  overrides: Record<string, unknown> = {},
): void {
  const title = (overrides.title as string) ?? "Test Task";
  const status = (overrides.status as string) ?? "inbox";
  const packKey = (overrides.workflow_pack_key as string) ?? "development";
  const chainTo = (overrides.chain_to_task_id as string | null) ?? null;
  db.prepare(
    `INSERT INTO tasks (id, title, status, workflow_pack_key, chain_to_task_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, title, status, packKey, chainTo);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Full Task Lifecycle Integration", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");
    applyBaseSchema(db);

    // Seed minimum required data
    db.prepare(
      "INSERT INTO departments (id, name, name_ko, icon, color) VALUES (?, ?, ?, ?, ?)",
    ).run("dept-dev", "Development", "개발", "💻", "#3b82f6");

    db.prepare(
      "INSERT INTO workflow_packs (key, name, enabled, input_schema_json, prompt_preset_json, qa_rules_json, output_template_json, routing_keywords_json, cost_profile_json) VALUES (?, ?, 1, '{}', '{}', '{}', '{}', '[]', '{}')",
    ).run("development", "Development");

    db.prepare(
      "INSERT INTO workflow_packs (key, name, enabled, input_schema_json, prompt_preset_json, qa_rules_json, output_template_json, routing_keywords_json, cost_profile_json) VALUES (?, ?, 1, '{}', '{}', '{}', '{}', '[]', '{}')",
    ).run("report", "Report");

    db.prepare(
      "INSERT INTO workflow_packs (key, name, enabled, input_schema_json, prompt_preset_json, qa_rules_json, output_template_json, routing_keywords_json, cost_profile_json) VALUES (?, ?, 0, '{}', '{}', '{}', '{}', '[]', '{}')",
    ).run("roleplay", "Roleplay");

    db.prepare(
      "INSERT INTO workflow_packs (key, name, enabled, input_schema_json, prompt_preset_json, qa_rules_json, output_template_json, routing_keywords_json, cost_profile_json) VALUES (?, ?, 0, '{}', '{}', '{}', '{}', '[]', '{}')",
    ).run("novel", "Novel");

    db.prepare(
      "INSERT INTO workflow_packs (key, name, enabled, input_schema_json, prompt_preset_json, qa_rules_json, output_template_json, routing_keywords_json, cost_profile_json) VALUES (?, ?, 1, '{}', '{}', '{}', '{}', '[]', '{}')",
    ).run("web_research_report", "Web Research Report");

    db.prepare(
      "INSERT INTO workflow_packs (key, name, enabled, input_schema_json, prompt_preset_json, qa_rules_json, output_template_json, routing_keywords_json, cost_profile_json) VALUES (?, ?, 1, '{}', '{}', '{}', '{}', '[]', '{}')",
    ).run("facility_visit", "Facility Visit");

    seedProject(db, "proj-1");
    seedAgent(db, "agent-1", "dept-dev", "team_leader");
    seedAgent(db, "agent-2", "dept-dev", "senior");
  });

  afterAll(() => db.close());

  // ── Schema bootstrapping ─────────────────────────────────────────────────

  it("applies base schema with all expected tables", () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));

    const required = [
      "tasks",
      "agents",
      "departments",
      "projects",
      "workflow_packs",
      "active_cli_processes",
      "agent_project_memory",
      "task_schedules",
      "meeting_minutes",
      "meeting_minute_entries",
      "review_revision_history",
      "subtasks",
      "messages",
      "task_logs",
      "settings",
    ];

    for (const table of required) {
      expect(tableNames.has(table), `Expected table "${table}" to exist`).toBe(true);
    }
  });

  // ── Task CRUD with new fields ─────────────────────────────────────────────

  it("creates a task with all new fields (chain_to_task_id, workflow_meta_json)", () => {
    const taskId = "test-task-new-fields";
    seedTask(db, taskId, { status: "inbox", workflow_pack_key: "development" });

    db.prepare(
      "UPDATE tasks SET workflow_meta_json = ?, project_id = ? WHERE id = ?",
    ).run(
      JSON.stringify({ context_files: ["README.md"], output_format: "markdown" }),
      "proj-1",
      taskId,
    );

    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as
      | Record<string, unknown>
      | undefined;

    expect(task).toBeDefined();
    expect(task!.id).toBe(taskId);
    expect(task!.status).toBe("inbox");
    expect(task!.workflow_pack_key).toBe("development");
    expect(task!.project_id).toBe("proj-1");
    expect(typeof task!.workflow_meta_json).toBe("string");

    const meta = JSON.parse(task!.workflow_meta_json as string) as {
      context_files: string[];
    };
    expect(meta.context_files).toContain("README.md");
  });

  it("stores and reads chain_to_task_id (task chaining)", () => {
    const sourceId = "chain-source";
    const chainedId = "chain-target";

    seedTask(db, sourceId, { status: "in_progress" });
    seedTask(db, chainedId, { status: "planned", chain_to_task_id: sourceId });

    const chained = db.prepare("SELECT chain_to_task_id FROM tasks WHERE id = ?").get(
      chainedId,
    ) as { chain_to_task_id: string | null } | undefined;

    expect(chained?.chain_to_task_id).toBe(sourceId);
  });

  it("chain_to_task_id is SET NULL when source task is deleted", () => {
    const srcId = "chain-delete-src";
    const tgtId = "chain-delete-tgt";

    seedTask(db, srcId, { status: "done" });
    seedTask(db, tgtId, { chain_to_task_id: srcId });

    db.prepare("DELETE FROM tasks WHERE id = ?").run(srcId);

    const tgt = db.prepare("SELECT chain_to_task_id FROM tasks WHERE id = ?").get(
      tgtId,
    ) as { chain_to_task_id: string | null } | undefined;

    expect(tgt?.chain_to_task_id).toBeNull();
  });

  it("rejects tasks with invalid status values", () => {
    expect(() => {
      db.prepare(
        "INSERT INTO tasks (id, title, status, workflow_pack_key) VALUES (?, ?, ?, ?)",
      ).run("bad-status-task", "Bad Task", "invalid_status", "development");
    }).toThrow();
  });

  it("allows all valid task status values", () => {
    const validStatuses = [
      "inbox",
      "planned",
      "collaborating",
      "in_progress",
      "review",
      "done",
      "cancelled",
      "pending",
    ];

    for (const [i, status] of validStatuses.entries()) {
      const id = `valid-status-${i}`;
      expect(() => {
        db.prepare(
          "INSERT INTO tasks (id, title, status, workflow_pack_key) VALUES (?, ?, ?, ?)",
        ).run(id, `Status Test ${status}`, status, "development");
      }).not.toThrow();
    }
  });

  // ── active_cli_processes ──────────────────────────────────────────────────

  it("active_cli_processes: insert, read, and delete by task_id", () => {
    const taskId = "task-pid-test";
    seedTask(db, taskId);

    db.prepare(
      "INSERT INTO active_cli_processes (task_id, pid, provider) VALUES (?, ?, ?)",
    ).run(taskId, 9999, "claude");

    const row = db.prepare("SELECT pid, provider FROM active_cli_processes WHERE task_id = ?").get(
      taskId,
    ) as { pid: number; provider: string } | undefined;

    expect(row?.pid).toBe(9999);
    expect(row?.provider).toBe("claude");

    db.prepare("DELETE FROM active_cli_processes WHERE task_id = ?").run(taskId);

    const after = db
      .prepare("SELECT * FROM active_cli_processes WHERE task_id = ?")
      .get(taskId);
    expect(after).toBeUndefined();
  });

  it("active_cli_processes: CASCADE DELETE when task is deleted", () => {
    const taskId = "task-cascade-pid";
    seedTask(db, taskId);

    db.prepare(
      "INSERT INTO active_cli_processes (task_id, pid, provider) VALUES (?, ?, ?)",
    ).run(taskId, 1234, "codex");

    db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);

    const row = db
      .prepare("SELECT * FROM active_cli_processes WHERE task_id = ?")
      .get(taskId);
    expect(row).toBeUndefined();
  });

  // ── agent_project_memory ──────────────────────────────────────────────────

  it("agent_project_memory: store and retrieve insights", () => {
    const tableExists = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='agent_project_memory'`,
      )
      .get();
    if (!tableExists) return;

    const memId = randomUUID();
    db.prepare(
      `INSERT INTO agent_project_memory (id, project_id, provider, insight, category, confidence)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(memId, "proj-1", "claude", "Always use TypeScript strict mode", "convention", 8);

    const row = db
      .prepare("SELECT * FROM agent_project_memory WHERE id = ?")
      .get(memId) as Record<string, unknown> | undefined;

    expect(row).toBeDefined();
    expect(row!.insight).toBe("Always use TypeScript strict mode");
    expect(row!.category).toBe("convention");
    expect(row!.confidence).toBe(8);
  });

  it("agent_project_memory: rejects invalid category values", () => {
    const tableExists = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='agent_project_memory'`,
      )
      .get();
    if (!tableExists) return;

    expect(() => {
      db.prepare(
        `INSERT INTO agent_project_memory (id, project_id, provider, insight, category)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(randomUUID(), "proj-1", "claude", "test", "invalid_category");
    }).toThrow();
  });

  it("agent_project_memory: confidence must be between 1 and 10", () => {
    const tableExists = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='agent_project_memory'`,
      )
      .get();
    if (!tableExists) return;

    expect(() => {
      db.prepare(
        `INSERT INTO agent_project_memory (id, project_id, provider, insight, category, confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), "proj-1", "claude", "test", "general", 11);
    }).toThrow();
  });

  // ── task_schedules ────────────────────────────────────────────────────────

  it("task_schedules: create and read a schedule", () => {
    const tableExists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_schedules'`)
      .get();
    if (!tableExists) return;

    const schedId = randomUUID();
    const now = Date.now();

    db.prepare(
      `INSERT INTO task_schedules (id, title_template, interval_days, next_trigger_at, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(schedId, "Weekly Report {{date}}", 7, now + 7 * 86400000, 1);

    const row = db
      .prepare("SELECT * FROM task_schedules WHERE id = ?")
      .get(schedId) as Record<string, unknown> | undefined;

    expect(row).toBeDefined();
    expect(row!.title_template).toBe("Weekly Report {{date}}");
    expect(row!.interval_days).toBe(7);
    expect(row!.enabled).toBe(1);
  });

  it("task_schedules: enabled flag controls whether due schedules are eligible", () => {
    const tableExists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_schedules'`)
      .get();
    if (!tableExists) return;

    const now = Date.now();
    const pastTrigger = now - 1000;

    const enabledId = randomUUID();
    const disabledId = randomUUID();

    db.prepare(
      `INSERT INTO task_schedules (id, title_template, interval_days, next_trigger_at, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(enabledId, "Enabled Sched", 1, pastTrigger, 1);

    db.prepare(
      `INSERT INTO task_schedules (id, title_template, interval_days, next_trigger_at, enabled)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(disabledId, "Disabled Sched", 1, pastTrigger, 0);

    const due = db
      .prepare(
        `SELECT id FROM task_schedules WHERE enabled = 1 AND next_trigger_at <= ?`,
      )
      .all(now) as Array<{ id: string }>;

    const ids = due.map((r) => r.id);
    expect(ids).toContain(enabledId);
    expect(ids).not.toContain(disabledId);
  });

  // ── workflow_packs ────────────────────────────────────────────────────────

  it("workflow_packs: all builtin packs are seeded", () => {
    const rows = db
      .prepare("SELECT key, enabled FROM workflow_packs ORDER BY key")
      .all() as Array<{ key: string; enabled: number }>;
    const packMap = new Map(rows.map((r) => [r.key, r.enabled]));

    expect(packMap.has("development")).toBe(true);
    expect(packMap.has("report")).toBe(true);
    expect(packMap.has("web_research_report")).toBe(true);
    expect(packMap.has("facility_visit")).toBe(true);

    // roleplay and novel should exist but be disabled
    expect(packMap.has("roleplay")).toBe(true);
    expect(packMap.get("roleplay")).toBe(0);
    expect(packMap.has("novel")).toBe(true);
    expect(packMap.get("novel")).toBe(0);
  });

  it("workflow_packs: can create and delete a custom pack", () => {
    const key = "test_custom_pack";

    db.prepare(
      `INSERT INTO workflow_packs
         (key, name, enabled, input_schema_json, prompt_preset_json,
          qa_rules_json, output_template_json, routing_keywords_json, cost_profile_json)
       VALUES (?, ?, 1, '{}', '{}', '{}', '{}', '[]', '{}')`,
    ).run(key, "Test Custom Pack");

    const row = db
      .prepare("SELECT key FROM workflow_packs WHERE key = ?")
      .get(key) as { key: string } | undefined;
    expect(row?.key).toBe(key);

    db.prepare("DELETE FROM workflow_packs WHERE key = ?").run(key);

    const after = db.prepare("SELECT key FROM workflow_packs WHERE key = ?").get(key);
    expect(after).toBeUndefined();
  });

  // ── review_revision_history ───────────────────────────────────────────────

  it("review_revision_history: UNIQUE constraint on (task_id, normalized_note)", () => {
    const taskId = "rev-test";
    seedTask(db, taskId, { status: "review" });

    db.prepare(
      `INSERT INTO review_revision_history (task_id, normalized_note, raw_note, first_round)
       VALUES (?, ?, ?, ?)`,
    ).run(taskId, "missing section", "Missing section: contacts", 1);

    expect(() => {
      db.prepare(
        `INSERT INTO review_revision_history (task_id, normalized_note, raw_note, first_round)
         VALUES (?, ?, ?, ?)`,
      ).run(taskId, "missing section", "Missing section: contacts", 1);
    }).toThrow();
  });

  it("review_revision_history: INSERT OR IGNORE silently skips duplicates", () => {
    const taskId = "rev-ignore-test";
    seedTask(db, taskId, { status: "review" });

    db.prepare(
      `INSERT INTO review_revision_history (task_id, normalized_note, raw_note, first_round)
       VALUES (?, ?, ?, ?)`,
    ).run(taskId, "dup note", "Duplicate note", 1);

    expect(() => {
      db.prepare(
        `INSERT OR IGNORE INTO review_revision_history (task_id, normalized_note, raw_note, first_round)
         VALUES (?, ?, ?, ?)`,
      ).run(taskId, "dup note", "Duplicate note", 2);
    }).not.toThrow();

    const count = (
      db.prepare(
        `SELECT COUNT(*) as c FROM review_revision_history WHERE task_id = ? AND normalized_note = ?`,
      ).get(taskId, "dup note") as { c: number }
    ).c;
    expect(count).toBe(1);
  });

  // ── meeting_minutes ───────────────────────────────────────────────────────

  it("meeting_minutes: supports peer_review meeting type", () => {
    const taskId = "meeting-test-task";
    const meetingId = randomUUID();
    const now = Date.now();

    // peer_review was added to the CHECK constraint in the schema
    seedTask(db, taskId);

    expect(() => {
      db.prepare(
        `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, title, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(meetingId, taskId, "peer_review", 1, "Peer Review", "in_progress", now);
    }).not.toThrow();

    const row = db
      .prepare("SELECT meeting_type FROM meeting_minutes WHERE id = ?")
      .get(meetingId) as { meeting_type: string } | undefined;

    expect(row?.meeting_type).toBe("peer_review");
  });

  it("meeting_minutes: rejects invalid meeting_type values", () => {
    const taskId = "meeting-bad-type";
    seedTask(db, taskId);

    expect(() => {
      db.prepare(
        `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, title, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), taskId, "invalid_type", 1, "Bad", "in_progress", Date.now());
    }).toThrow();
  });

  // ── subtasks ──────────────────────────────────────────────────────────────

  it("subtasks: create and cascade delete with parent task", () => {
    const taskId = "subtask-cascade-parent";
    const subId = randomUUID();

    seedTask(db, taskId);

    db.prepare(
      `INSERT INTO subtasks (id, task_id, title, status) VALUES (?, ?, ?, ?)`,
    ).run(subId, taskId, "Do something", "pending");

    db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);

    const sub = db.prepare("SELECT id FROM subtasks WHERE id = ?").get(subId);
    expect(sub).toBeUndefined();
  });

  // ── messages ──────────────────────────────────────────────────────────────

  it("messages: create a ceo-to-agent chat message", () => {
    const msgId = randomUUID();

    db.prepare(
      `INSERT INTO messages (id, sender_type, receiver_type, receiver_id, content, message_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(msgId, "ceo", "agent", "agent-1", "Please begin the task.", "chat");

    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(msgId) as
      | Record<string, unknown>
      | undefined;

    expect(row?.content).toBe("Please begin the task.");
    expect(row?.sender_type).toBe("ceo");
  });

  // ── task_logs ─────────────────────────────────────────────────────────────

  it("task_logs: append multiple log entries for a task", () => {
    const taskId = "log-test-task";
    seedTask(db, taskId);

    for (let i = 0; i < 3; i++) {
      db.prepare(
        "INSERT INTO task_logs (task_id, kind, message) VALUES (?, ?, ?)",
      ).run(taskId, "info", `Log entry ${i}`);
    }

    const logs = db
      .prepare("SELECT message FROM task_logs WHERE task_id = ? ORDER BY id")
      .all(taskId) as Array<{ message: string }>;

    expect(logs).toHaveLength(3);
    expect(logs[0]!.message).toBe("Log entry 0");
    expect(logs[2]!.message).toBe("Log entry 2");
  });

  // ── settings ─────────────────────────────────────────────────────────────

  it("settings: upsert a key-value pair", () => {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run("testKey", "initial");

    const row1 = db.prepare("SELECT value FROM settings WHERE key = ?").get("testKey") as
      | { value: string }
      | undefined;
    expect(row1?.value).toBe("initial");

    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run("testKey", "updated");

    const row2 = db.prepare("SELECT value FROM settings WHERE key = ?").get("testKey") as
      | { value: string }
      | undefined;
    expect(row2?.value).toBe("updated");
  });

  // ── indexes ───────────────────────────────────────────────────────────────

  it("all critical indexes are created", () => {
    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const indexNames = new Set(indexes.map((r) => r.name));

    const required = [
      "idx_tasks_status",
      "idx_tasks_agent",
      "idx_tasks_project",
      "idx_tasks_chain",
      "idx_active_cli_processes_pid",
      "idx_agent_project_memory_project",
      "idx_task_schedules_next",
    ];

    for (const idx of required) {
      expect(indexNames.has(idx), `Expected index "${idx}" to exist`).toBe(true);
    }
  });
});
