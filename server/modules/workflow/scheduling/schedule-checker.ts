import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type ScheduleRow = {
  id: string;
  title_template: string;
  description_template: string | null;
  workflow_pack_key: string;
  project_id: string | null;
  assigned_agent_id: string | null;
  workflow_meta_json: string | null;
  priority: number;
  interval_days: number;
  next_trigger_at: number;
};

export function checkAndFireSchedules(
  db: DatabaseSync,
  broadcast: (type: string, data: unknown) => void,
): void {
  const now = Date.now();
  const dueSchedules = db
    .prepare(
      `SELECT * FROM task_schedules WHERE enabled = 1 AND next_trigger_at <= ?`,
    )
    .all(now) as ScheduleRow[];

  for (const schedule of dueSchedules) {
    const today = new Date().toISOString().slice(0, 10);
    const title = schedule.title_template
      .replace(/\{\{date\}\}/g, today)
      .replace(/\{\{YYYY-MM-DD\}\}/g, today);
    const rawDesc = schedule.description_template ?? "";
    const description = rawDesc.replace(/\{\{date\}\}/g, today) || null;

    const taskId = randomUUID();
    db.prepare(
      `INSERT INTO tasks (id, title, description, workflow_pack_key, project_id,
        assigned_agent_id, workflow_meta_json, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?)`,
    ).run(
      taskId,
      title,
      description,
      schedule.workflow_pack_key,
      schedule.project_id,
      schedule.assigned_agent_id,
      schedule.workflow_meta_json,
      schedule.priority,
      now,
      now,
    );

    // Advance next trigger by interval_days
    const nextTrigger =
      schedule.next_trigger_at + schedule.interval_days * 24 * 60 * 60 * 1000;
    db.prepare(
      `UPDATE task_schedules SET last_triggered_at = ?, next_trigger_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, nextTrigger, now, schedule.id);

    broadcast("task_created", { id: taskId, title, status: "planned" });
    console.log(
      `[Scheduler] Created task "${title}" from schedule ${schedule.id}`,
    );
  }
}
