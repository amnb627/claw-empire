import { describe, expect, it, vi } from "vitest";
import { checkAndFireSchedules } from "./schedule-checker.ts";

// Minimal mock DB that tracks insertions and updates
function buildDb(schedules: Array<Record<string, unknown>> = []) {
  const tasks: Array<Record<string, unknown>> = [];
  const updatedSchedules: Array<{ id: string; next_trigger_at: number; last_triggered_at: number }> = [];

  const db = {
    _tasks: tasks,
    _updatedSchedules: updatedSchedules,
    prepare: (sql: string) => ({
      all: (_now?: number) => {
        if (sql.includes("task_schedules")) return schedules;
        return [];
      },
      run: (...args: unknown[]) => {
        if (sql.includes("INSERT INTO tasks")) {
          // SQL: INSERT INTO tasks (id, title, description, workflow_pack_key, project_id,
          //   assigned_agent_id, workflow_meta_json, priority, status, created_at, updated_at)
          //   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?)
          // Args:  0=id, 1=title, 2=description, 3=workflow_pack_key, 4=project_id,
          //        5=assigned_agent_id, 6=workflow_meta_json, 7=priority, 8=now, 9=now
          // Note: 'planned' is a SQL literal, not a bound param
          const [id, title, , workflow_pack_key] = args;
          tasks.push({ id, title, workflow_pack_key, status: "planned" });
        }
        if (sql.includes("UPDATE task_schedules")) {
          const [last_triggered_at, next_trigger_at, , id] = args;
          updatedSchedules.push({
            id: id as string,
            next_trigger_at: next_trigger_at as number,
            last_triggered_at: last_triggered_at as number,
          });
        }
      },
    }),
  };
  return db;
}

describe("checkAndFireSchedules", () => {
  it("creates a task when next_trigger_at <= now", () => {
    const now = Date.now();
    const broadcast = vi.fn();
    const schedules = [
      {
        id: "sched-1",
        title_template: "Weekly Report",
        description_template: null,
        workflow_pack_key: "report",
        project_id: null,
        assigned_agent_id: null,
        workflow_meta_json: null,
        priority: 0,
        interval_days: 7,
        next_trigger_at: now - 1000, // already past
      },
    ];

    const db = buildDb(schedules);
    checkAndFireSchedules(db as any, broadcast);

    expect(db._tasks).toHaveLength(1);
    expect(db._tasks[0]!.title).toBe("Weekly Report");
    expect(db._tasks[0]!.workflow_pack_key).toBe("report");
    expect(db._tasks[0]!.status).toBe("planned");
    expect(broadcast).toHaveBeenCalledWith("task_created", expect.objectContaining({ title: "Weekly Report" }));
  });

  it("advances next_trigger_at by interval_days after firing", () => {
    const now = Date.now();
    const broadcast = vi.fn();
    const nextTriggerAt = now - 500;
    const intervalDays = 7;
    const schedules = [
      {
        id: "sched-2",
        title_template: "Task {{date}}",
        description_template: null,
        workflow_pack_key: "development",
        project_id: null,
        assigned_agent_id: null,
        workflow_meta_json: null,
        priority: 0,
        interval_days: intervalDays,
        next_trigger_at: nextTriggerAt,
      },
    ];

    const db = buildDb(schedules);
    checkAndFireSchedules(db as any, broadcast);

    expect(db._updatedSchedules).toHaveLength(1);
    const expectedNext = nextTriggerAt + intervalDays * 24 * 60 * 60 * 1000;
    expect(db._updatedSchedules[0]!.next_trigger_at).toBe(expectedNext);
  });

  it("skips disabled schedules (enabled = 0)", () => {
    const now = Date.now();
    const broadcast = vi.fn();
    // Simulating disabled: the SQL WHERE clause filters them out,
    // so the mock simply returns an empty array when enabled=0 schedules are passed
    const db = buildDb([]); // empty because disabled ones are filtered by SQL
    checkAndFireSchedules(db as any, broadcast);

    expect(db._tasks).toHaveLength(0);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("does nothing when no schedules are due", () => {
    const now = Date.now();
    const broadcast = vi.fn();
    // All schedules have future next_trigger_at — they would not be returned by the SQL query
    const db = buildDb([]); // empty result simulates no due schedules
    checkAndFireSchedules(db as any, broadcast);

    expect(db._tasks).toHaveLength(0);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("interpolates {{date}} in title_template", () => {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const broadcast = vi.fn();
    const schedules = [
      {
        id: "sched-3",
        title_template: "Audit {{date}}",
        description_template: "Run on {{date}}",
        workflow_pack_key: "report",
        project_id: null,
        assigned_agent_id: null,
        workflow_meta_json: null,
        priority: 0,
        interval_days: 1,
        next_trigger_at: now - 1,
      },
    ];

    const db = buildDb(schedules);
    checkAndFireSchedules(db as any, broadcast);

    expect(db._tasks[0]!.title).toBe(`Audit ${today}`);
    expect(broadcast).toHaveBeenCalledWith("task_created", expect.objectContaining({ title: `Audit ${today}` }));
  });

  it("fires multiple due schedules in one call", () => {
    const now = Date.now();
    const broadcast = vi.fn();
    const schedules = [
      {
        id: "sched-a",
        title_template: "Task A",
        description_template: null,
        workflow_pack_key: "report",
        project_id: null,
        assigned_agent_id: null,
        workflow_meta_json: null,
        priority: 0,
        interval_days: 7,
        next_trigger_at: now - 2000,
      },
      {
        id: "sched-b",
        title_template: "Task B",
        description_template: null,
        workflow_pack_key: "development",
        project_id: null,
        assigned_agent_id: null,
        workflow_meta_json: null,
        priority: 1,
        interval_days: 3,
        next_trigger_at: now - 1000,
      },
    ];

    const db = buildDb(schedules);
    checkAndFireSchedules(db as any, broadcast);

    expect(db._tasks).toHaveLength(2);
    expect(broadcast).toHaveBeenCalledTimes(2);
  });
});
