import { randomUUID } from "node:crypto";
import type { RuntimeContext } from "../../../types/runtime-context.ts";
import { checkAndFireSchedules } from "../../workflow/scheduling/schedule-checker.ts";

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
  last_triggered_at: number | null;
  enabled: number;
  created_at: number;
  updated_at: number;
};

function rowToSchedule(row: ScheduleRow) {
  return {
    id: row.id,
    title_template: row.title_template,
    description_template: row.description_template,
    workflow_pack_key: row.workflow_pack_key,
    project_id: row.project_id,
    assigned_agent_id: row.assigned_agent_id,
    workflow_meta_json: row.workflow_meta_json,
    priority: row.priority,
    interval_days: row.interval_days,
    next_trigger_at: row.next_trigger_at,
    last_triggered_at: row.last_triggered_at,
    enabled: row.enabled !== 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function registerScheduleRoutes(
  ctx: Pick<RuntimeContext, "app" | "db" | "nowMs" | "broadcast" | "normalizeTextField">,
): void {
  const { app, db, nowMs, broadcast, normalizeTextField } = ctx;

  // GET /api/schedules
  app.get("/api/schedules", (_req, res) => {
    const rows = db
      .prepare(`SELECT * FROM task_schedules ORDER BY next_trigger_at ASC`)
      .all() as ScheduleRow[];
    return res.json({ schedules: rows.map(rowToSchedule) });
  });

  // POST /api/schedules
  app.post("/api/schedules", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const titleTemplate = normalizeTextField(body.title_template);
    if (!titleTemplate) {
      return res.status(400).json({ error: "title_template_required" });
    }

    const intervalDays = parseInt(String(body.interval_days ?? "7"), 10);
    if (!Number.isFinite(intervalDays) || intervalDays < 1) {
      return res.status(400).json({ error: "interval_days_must_be_positive_integer" });
    }

    const nextTriggerRaw = body.next_trigger_at;
    const nextTriggerAt =
      typeof nextTriggerRaw === "number" && Number.isFinite(nextTriggerRaw)
        ? Math.round(nextTriggerRaw)
        : nowMs() + intervalDays * 24 * 60 * 60 * 1000;

    const descriptionTemplate = normalizeTextField(body.description_template) ?? null;
    const workflowPackKey = normalizeTextField(body.workflow_pack_key) ?? "report";
    const projectId = normalizeTextField(body.project_id) ?? null;
    const assignedAgentId = normalizeTextField(body.assigned_agent_id) ?? null;
    const workflowMetaJson =
      body.workflow_meta_json != null
        ? typeof body.workflow_meta_json === "string"
          ? body.workflow_meta_json
          : JSON.stringify(body.workflow_meta_json)
        : null;
    const priority =
      typeof body.priority === "number" ? Math.round(body.priority) : 0;
    const enabled =
      body.enabled === false || body.enabled === 0 || String(body.enabled) === "0" ? 0 : 1;

    const id = randomUUID();
    const now = nowMs();

    db.prepare(
      `INSERT INTO task_schedules
        (id, title_template, description_template, workflow_pack_key, project_id,
         assigned_agent_id, workflow_meta_json, priority, interval_days,
         next_trigger_at, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      titleTemplate,
      descriptionTemplate,
      workflowPackKey,
      projectId,
      assignedAgentId,
      workflowMetaJson,
      priority,
      intervalDays,
      nextTriggerAt,
      enabled,
      now,
      now,
    );

    const row = db
      .prepare(`SELECT * FROM task_schedules WHERE id = ?`)
      .get(id) as ScheduleRow | undefined;
    if (!row) return res.status(500).json({ error: "schedule_reload_failed" });

    return res.status(201).json({ ok: true, schedule: rowToSchedule(row) });
  });

  // PUT /api/schedules/:id
  app.put("/api/schedules/:id", (req, res) => {
    const { id } = req.params;
    const existing = db
      .prepare(`SELECT id FROM task_schedules WHERE id = ?`)
      .get(id) as { id: string } | undefined;
    if (!existing) return res.status(404).json({ error: "schedule_not_found" });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: string[] = ["updated_at = ?"];
    const params: unknown[] = [nowMs()];

    if ("title_template" in body) {
      const v = normalizeTextField(body.title_template);
      if (!v) return res.status(400).json({ error: "title_template_required" });
      updates.push("title_template = ?");
      params.push(v);
    }
    if ("description_template" in body) {
      updates.push("description_template = ?");
      params.push(normalizeTextField(body.description_template) ?? null);
    }
    if ("workflow_pack_key" in body) {
      const v = normalizeTextField(body.workflow_pack_key);
      if (v) { updates.push("workflow_pack_key = ?"); params.push(v); }
    }
    if ("project_id" in body) {
      updates.push("project_id = ?");
      params.push(normalizeTextField(body.project_id) ?? null);
    }
    if ("assigned_agent_id" in body) {
      updates.push("assigned_agent_id = ?");
      params.push(normalizeTextField(body.assigned_agent_id) ?? null);
    }
    if ("workflow_meta_json" in body) {
      const wmj = body.workflow_meta_json;
      updates.push("workflow_meta_json = ?");
      params.push(
        wmj == null
          ? null
          : typeof wmj === "string"
          ? wmj
          : JSON.stringify(wmj),
      );
    }
    if ("priority" in body && typeof body.priority === "number") {
      updates.push("priority = ?");
      params.push(Math.round(body.priority));
    }
    if ("interval_days" in body) {
      const v = parseInt(String(body.interval_days), 10);
      if (!Number.isFinite(v) || v < 1) {
        return res.status(400).json({ error: "interval_days_must_be_positive_integer" });
      }
      updates.push("interval_days = ?");
      params.push(v);
    }
    if ("next_trigger_at" in body && typeof body.next_trigger_at === "number") {
      updates.push("next_trigger_at = ?");
      params.push(Math.round(body.next_trigger_at));
    }
    if ("enabled" in body) {
      const v =
        body.enabled === false || body.enabled === 0 || String(body.enabled) === "0" ? 0 : 1;
      updates.push("enabled = ?");
      params.push(v);
    }

    if (updates.length <= 1) return res.status(400).json({ error: "no_fields" });

    params.push(id);
    db.prepare(`UPDATE task_schedules SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    const row = db
      .prepare(`SELECT * FROM task_schedules WHERE id = ?`)
      .get(id) as ScheduleRow | undefined;
    if (!row) return res.status(500).json({ error: "schedule_reload_failed" });
    return res.json({ ok: true, schedule: rowToSchedule(row) });
  });

  // DELETE /api/schedules/:id
  app.delete("/api/schedules/:id", (req, res) => {
    const { id } = req.params;
    const existing = db
      .prepare(`SELECT id FROM task_schedules WHERE id = ?`)
      .get(id) as { id: string } | undefined;
    if (!existing) return res.status(404).json({ error: "schedule_not_found" });

    db.prepare(`DELETE FROM task_schedules WHERE id = ?`).run(id);
    return res.json({ ok: true, id });
  });

  // POST /api/schedules/:id/trigger — manually fire a schedule immediately
  app.post("/api/schedules/:id/trigger", (req, res) => {
    const { id } = req.params;
    const existing = db
      .prepare(`SELECT id FROM task_schedules WHERE id = ?`)
      .get(id) as { id: string } | undefined;
    if (!existing) return res.status(404).json({ error: "schedule_not_found" });

    // Temporarily force next_trigger_at to now-1 so the checker fires it
    const now = nowMs();
    db.prepare(`UPDATE task_schedules SET next_trigger_at = ?, enabled = 1 WHERE id = ?`).run(
      now - 1,
      id,
    );
    checkAndFireSchedules(db, broadcast);
    return res.json({ ok: true });
  });
}
