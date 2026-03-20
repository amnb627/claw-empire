import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import type { RuntimeContext } from "../../../../types/runtime-context.ts";
import type { MeetingMinuteEntryRow, MeetingMinutesRow } from "../../shared/types.ts";
import { isKnownPackKey, DEFAULT_WORKFLOW_PACK_KEY } from "../../../workflow/packs/definitions.ts";
import { resolveWorkflowPackKeyForTask } from "../../../workflow/packs/task-pack-resolver.ts";
import { validateTaskCreateBody } from "./validation.ts";
import type { AsyncReader } from "../../../../db/async-reader.ts";

export type TaskCrudRouteDeps = Pick<
  RuntimeContext,
  | "app"
  | "db"
  | "nowMs"
  | "firstQueryValue"
  | "reconcileCrossDeptSubtasks"
  | "normalizeTextField"
  | "recordTaskCreationAudit"
  | "appendTaskLog"
  | "broadcast"
  | "setTaskCreationAuditCompletion"
  | "clearTaskWorkflowState"
  | "endTaskExecutionSession"
  | "activeProcesses"
  | "stopRequestedTasks"
  | "killPidTree"
  | "logsDir"
> & {
  /**
   * Optional async reader backed by a worker thread pool.
   * When provided, GET /api/tasks offloads the main SELECT to a worker thread
   * so the event loop is not blocked during heavy list queries.
   * When absent, the existing synchronous db path is used (tests / simple deploys).
   */
  asyncReader?: AsyncReader;
};

export function registerTaskCrudRoutes(deps: TaskCrudRouteDeps): void {
  const {
    app,
    db,
    nowMs,
    firstQueryValue,
    reconcileCrossDeptSubtasks,
    normalizeTextField,
    recordTaskCreationAudit,
    appendTaskLog,
    broadcast,
    setTaskCreationAuditCompletion,
    clearTaskWorkflowState,
    endTaskExecutionSession,
    activeProcesses,
    stopRequestedTasks,
    killPidTree,
    asyncReader,
    logsDir,
  } = deps;

  function normalizeProjectPathInput(raw: unknown): string | null {
    const value = normalizeTextField(raw);
    if (!value) return null;

    let candidate = value;
    if (candidate === "~") {
      candidate = os.homedir();
    } else if (candidate.startsWith("~/")) {
      candidate = path.join(os.homedir(), candidate.slice(2));
    } else if (candidate === "/Projects" || candidate.startsWith("/Projects/")) {
      const suffix = candidate.slice("/Projects".length).replace(/^\/+/, "");
      candidate = suffix ? path.join(os.homedir(), "Projects", suffix) : path.join(os.homedir(), "Projects");
    } else if (candidate === "/projects" || candidate.startsWith("/projects/")) {
      const suffix = candidate.slice("/projects".length).replace(/^\/+/, "");
      candidate = suffix ? path.join(os.homedir(), "projects", suffix) : path.join(os.homedir(), "projects");
    }

    const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    return path.normalize(absolute);
  }

  app.get("/api/tasks", (req, res) => {
    reconcileCrossDeptSubtasks();
    const statusFilter = firstQueryValue(req.query.status);
    const deptFilter = firstQueryValue(req.query.department_id);
    const agentFilter = firstQueryValue(req.query.agent_id);
    const projectFilter = firstQueryValue(req.query.project_id);
    const workflowPackFilter = normalizeTextField(firstQueryValue(req.query.workflow_pack_key));

    if (workflowPackFilter && !isKnownPackKey(workflowPackFilter)) {
      return res.status(400).json({ error: "invalid_workflow_pack_key" });
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statusFilter) {
      conditions.push("t.status = ?");
      params.push(statusFilter);
    }
    if (deptFilter) {
      conditions.push("t.department_id = ?");
      params.push(deptFilter);
    }
    if (agentFilter) {
      conditions.push("t.assigned_agent_id = ?");
      params.push(agentFilter);
    }
    if (projectFilter) {
      conditions.push("t.project_id = ?");
      params.push(projectFilter);
    }
    if (workflowPackFilter) {
      conditions.push("t.workflow_pack_key = ?");
      params.push(workflowPackFilter);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const subtaskTotalExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id)
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;
    const subtaskDoneExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done')
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND c.status = 'done'
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;

    const primarySql = `
      SELECT t.*,
        a.name AS agent_name,
        a.avatar_emoji AS agent_avatar,
        COALESCE(opd.name, d.name) AS department_name,
        COALESCE(opd.icon, d.icon) AS department_icon,
        p.name AS project_name,
        p.core_goal AS project_core_goal,
        ${subtaskTotalExpr} AS subtask_total,
        ${subtaskDoneExpr} AS subtask_done
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      LEFT JOIN office_pack_departments opd
        ON opd.workflow_pack_key = COALESCE(t.workflow_pack_key, 'development')
       AND opd.department_id = t.department_id
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      ${where}
      ORDER BY t.priority DESC, t.updated_at DESC
    `;

    // Async path: offload to worker thread so the event loop is not blocked.
    if (asyncReader) {
      return asyncReader
        .query(primarySql, params as SQLInputValue[])
        .then((tasks) => res.json({ tasks }))
        .catch((err: unknown) => {
          console.error("[GET /api/tasks] asyncReader error:", err);
          res.status(500).json({ error: "query_failed" });
        });
    }

    // Sync path (default): used in tests and when no async reader is configured.
    const fallbackSql = `
      SELECT t.*,
        a.name AS agent_name,
        a.avatar_emoji AS agent_avatar,
        d.name AS department_name,
        d.icon AS department_icon,
        p.name AS project_name,
        p.core_goal AS project_core_goal,
        ${subtaskTotalExpr} AS subtask_total,
        ${subtaskDoneExpr} AS subtask_done
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      ${where}
      ORDER BY t.priority DESC, t.updated_at DESC
    `;

    let tasks: unknown[];
    try {
      tasks = db.prepare(primarySql).all(...(params as SQLInputValue[]));
    } catch {
      tasks = db.prepare(fallbackSql).all(...(params as SQLInputValue[]));
    }

    res.json({ tasks });
  });

  app.post("/api/tasks", (req, res) => {
    const validated = validateTaskCreateBody(req.body, normalizeTextField);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error });
    }
    const body = validated.data;
    const id = randomUUID();
    const t = nowMs();

    const title = body.title;

    const requestedProjectId = body.project_id;
    let resolvedProjectId: string | null = null;
    let resolvedProjectPath = normalizeProjectPathInput(body.project_path);
    if (requestedProjectId) {
      const project = db.prepare("SELECT id, project_path FROM projects WHERE id = ?").get(requestedProjectId) as
        | {
            id: string;
            project_path: string;
          }
        | undefined;
      if (!project) return res.status(400).json({ error: "project_not_found" });
      resolvedProjectId = project.id;
      if (!resolvedProjectPath) resolvedProjectPath = normalizeTextField(project.project_path);
    } else if (resolvedProjectPath) {
      const projectByPath = db
        .prepare(
          "SELECT id, project_path FROM projects WHERE project_path = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1",
        )
        .get(resolvedProjectPath) as { id: string; project_path: string } | undefined;
      if (projectByPath) {
        resolvedProjectId = projectByPath.id;
        resolvedProjectPath = normalizeTextField(projectByPath.project_path) ?? resolvedProjectPath;
      }
    }

    // Tasks with chain_to_task_id are waiting for the source task: force status to 'pending'
    const resolvedStatus = body.chain_to_task_id ? "pending" : body.status;

    db.prepare(
      `
    INSERT INTO tasks (
      id, title, description, department_id, assigned_agent_id, project_id,
      status, priority, task_type, workflow_pack_key, workflow_meta_json, output_format,
      project_path, base_branch, chain_to_task_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      id,
      title,
      body.description,
      body.department_id,
      body.assigned_agent_id,
      resolvedProjectId,
      resolvedStatus,
      body.priority,
      body.task_type,
      resolveWorkflowPackKeyForTask({
        db: db as any,
        explicitPackKey: body.workflow_pack_key,
        projectId: resolvedProjectId,
      }),
      body.workflow_meta_json,
      body.output_format,
      resolvedProjectPath,
      body.base_branch,
      body.chain_to_task_id,
      t,
      t,
    );
    recordTaskCreationAudit({
      taskId: id,
      taskTitle: title,
      taskStatus: body.status,
      departmentId: body.department_id,
      assignedAgentId: body.assigned_agent_id,
      taskType: body.task_type,
      projectPath: resolvedProjectPath,
      trigger: "api.tasks.create",
      triggerDetail: "POST /api/tasks",
      actorType: "api_client",
      req,
      body: body as unknown as Record<string, unknown>,
    });

    if (resolvedProjectId) {
      db.prepare("UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?").run(t, t, resolvedProjectId);
    }

    appendTaskLog(id, "system", `Task created: ${title}`);

    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    broadcast("task_update", task);
    res.json({ id, task });
  });

  app.get("/api/tasks/:id", (req, res) => {
    const id = String(req.params.id);
    reconcileCrossDeptSubtasks(id);
    const subtaskTotalExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id)
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;
    const subtaskDoneExpr = `(
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done')
    +
    (SELECT COUNT(*)
     FROM tasks c
     WHERE c.source_task_id = t.id
       AND c.status = 'done'
       AND NOT EXISTS (
         SELECT 1
         FROM subtasks s2
         WHERE s2.task_id = t.id
           AND s2.delegated_task_id = c.id
       )
    )
  )`;
    let task: unknown;
    try {
      task = db
        .prepare(
          `
      SELECT t.*,
        a.name AS agent_name,
        a.avatar_emoji AS agent_avatar,
        a.cli_provider AS agent_provider,
        COALESCE(opd.name, d.name) AS department_name,
        COALESCE(opd.icon, d.icon) AS department_icon,
        p.name AS project_name,
        p.core_goal AS project_core_goal,
        ${subtaskTotalExpr} AS subtask_total,
        ${subtaskDoneExpr} AS subtask_done
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      LEFT JOIN office_pack_departments opd
        ON opd.workflow_pack_key = COALESCE(t.workflow_pack_key, 'development')
       AND opd.department_id = t.department_id
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `,
        )
        .get(id);
    } catch {
      task = db
        .prepare(
          `
      SELECT t.*,
        a.name AS agent_name,
        a.avatar_emoji AS agent_avatar,
        a.cli_provider AS agent_provider,
        d.name AS department_name,
        d.icon AS department_icon,
        p.name AS project_name,
        p.core_goal AS project_core_goal,
        ${subtaskTotalExpr} AS subtask_total,
        ${subtaskDoneExpr} AS subtask_done
      FROM tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `,
        )
        .get(id);
    }
    if (!task) return res.status(404).json({ error: "not_found" });

    const logs = db.prepare("SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at DESC LIMIT 200").all(id);
    const subtasks = db.prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at").all(id);

    res.json({ task, logs, subtasks });
  });

  app.get("/api/tasks/:id/meeting-minutes", (req, res) => {
    const id = String(req.params.id);
    const task = db.prepare("SELECT id, source_task_id FROM tasks WHERE id = ?").get(id) as
      | { id: string; source_task_id: string | null }
      | undefined;
    if (!task) return res.status(404).json({ error: "not_found" });

    const taskIds = [id];
    if (task.source_task_id) taskIds.push(task.source_task_id);

    const meetings = db
      .prepare(
        `SELECT * FROM meeting_minutes WHERE task_id IN (${taskIds.map(() => "?").join(",")}) ORDER BY started_at DESC, round DESC`,
      )
      .all(...taskIds) as unknown as MeetingMinutesRow[];

    const data = meetings.map((meeting) => {
      const entries = db
        .prepare("SELECT * FROM meeting_minute_entries WHERE meeting_id = ? ORDER BY seq ASC, id ASC")
        .all(meeting.id) as unknown as MeetingMinuteEntryRow[];
      return { ...meeting, entries };
    });

    res.json({ meetings: data });
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "not_found" });

    const body = { ...(req.body ?? {}) } as Record<string, unknown>;
    if ("workflow_pack_key" in body) {
      const workflowPackKey = normalizeTextField(body.workflow_pack_key);
      // Unknown pack keys fall back to "development" instead of rejecting
      body.workflow_pack_key = workflowPackKey && isKnownPackKey(workflowPackKey)
        ? workflowPackKey
        : DEFAULT_WORKFLOW_PACK_KEY;
    }
    if ("workflow_meta_json" in body) {
      const rawWorkflowMeta = body.workflow_meta_json;
      if (rawWorkflowMeta === null) {
        body.workflow_meta_json = null;
      } else if (typeof rawWorkflowMeta === "string") {
        body.workflow_meta_json = rawWorkflowMeta;
      } else {
        body.workflow_meta_json = JSON.stringify(rawWorkflowMeta);
      }
    }
    if ("output_format" in body && body.output_format !== null && typeof body.output_format !== "string") {
      return res.status(400).json({ error: "invalid_output_format" });
    }

    const allowedFields = [
      "title",
      "description",
      "department_id",
      "assigned_agent_id",
      "status",
      "priority",
      "task_type",
      "workflow_pack_key",
      "workflow_meta_json",
      "output_format",
      "project_path",
      "result",
      "hidden",
    ];

    const updates: string[] = ["updated_at = ?"];
    const updateTs = nowMs();
    const params: unknown[] = [updateTs];
    let touchedProjectId: string | null = null;

    for (const field of allowedFields) {
      if (field in body) {
        updates.push(`${field} = ?`);
        params.push(body[field]);
      }
    }

    if ("project_id" in (body as any)) {
      const requestedProjectId = normalizeTextField((body as any).project_id);
      if (!requestedProjectId) {
        updates.push("project_id = ?");
        params.push(null);
      } else {
        const project = db.prepare("SELECT id, project_path FROM projects WHERE id = ?").get(requestedProjectId) as
          | {
              id: string;
              project_path: string;
            }
          | undefined;
        if (!project) return res.status(400).json({ error: "project_not_found" });
        updates.push("project_id = ?");
        params.push(project.id);
        touchedProjectId = project.id;
        if (!("project_path" in (body as any))) {
          updates.push("project_path = ?");
          params.push(project.project_path);
        }
      }
    }

    if ((body as any).status === "done" && !("completed_at" in (body as any))) {
      updates.push("completed_at = ?");
      params.push(nowMs());
    }
    if ((body as any).status === "in_progress" && !("started_at" in (body as any))) {
      updates.push("started_at = ?");
      params.push(nowMs());
    }

    params.push(id);
    db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...(params as SQLInputValue[]));
    if (touchedProjectId) {
      db.prepare("UPDATE projects SET last_used_at = ?, updated_at = ? WHERE id = ?").run(
        updateTs,
        updateTs,
        touchedProjectId,
      );
    }

    const nextStatus = typeof (body as any).status === "string" ? (body as any).status : null;
    if (nextStatus) {
      setTaskCreationAuditCompletion(id, nextStatus === "done");
    }
    if (
      nextStatus &&
      (nextStatus === "cancelled" || nextStatus === "pending" || nextStatus === "done" || nextStatus === "inbox")
    ) {
      clearTaskWorkflowState(id);
      if (nextStatus === "done" || nextStatus === "cancelled") {
        endTaskExecutionSession(id, `task_status_${nextStatus}`);
      }
    }

    appendTaskLog(id, "system", `Task updated: ${Object.keys(body as object).join(", ")}`);

    const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    broadcast("task_update", updated);
    res.json({ ok: true, task: updated });
  });

  app.post("/api/tasks/bulk-hide", (req, res) => {
    const { statuses, hidden } = req.body ?? {};
    if (!Array.isArray(statuses) || statuses.length === 0 || (hidden !== 0 && hidden !== 1)) {
      return res.status(400).json({ error: "invalid_body" });
    }
    const placeholders = statuses.map(() => "?").join(",");
    const result = db
      .prepare(`UPDATE tasks SET hidden = ?, updated_at = ? WHERE status IN (${placeholders}) AND hidden != ?`)
      .run(hidden, nowMs(), ...statuses, hidden);
    broadcast("tasks_changed", {});
    res.json({ ok: true, affected: result.changes });
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | {
          assigned_agent_id: string | null;
        }
      | undefined;
    if (!existing) return res.status(404).json({ error: "not_found" });

    endTaskExecutionSession(id, "task_deleted");
    clearTaskWorkflowState(id);

    const activeChild = activeProcesses.get(id);
    if (activeChild?.pid) {
      stopRequestedTasks.add(id);
      if (activeChild.pid < 0) {
        activeChild.kill();
      } else {
        killPidTree(activeChild.pid);
      }
      activeProcesses.delete(id);
    }

    if (existing.assigned_agent_id) {
      db.prepare("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ? AND current_task_id = ?").run(
        existing.assigned_agent_id,
        id,
      );
    }

    db.prepare("DELETE FROM task_logs WHERE task_id = ?").run(id);
    db.prepare("DELETE FROM messages WHERE task_id = ?").run(id);
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);

    for (const suffix of [".log", ".prompt.txt"]) {
      const filePath = path.join(logsDir, `${id}${suffix}`);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // 로그 파일 정리는 베스트 에포트
      }
    }

    broadcast("task_update", { id, deleted: true });
    res.json({ ok: true });
  });

  // Output file viewer endpoints
  app.get("/api/tasks/:id/output", (req, res) => {
    const taskId = String(req.params.id);
    const task = db
      .prepare("SELECT project_path, workflow_meta_json FROM tasks WHERE id = ?")
      .get(taskId) as { project_path: string | null; workflow_meta_json: string | null } | undefined;

    if (!task?.project_path) return res.json({ files: [] });

    const outputDir = path.join(task.project_path, "claw_output", taskId);
    if (!fs.existsSync(outputDir)) return res.json({ files: [] });

    let filenames: string[] = [];
    try {
      filenames = fs.readdirSync(outputDir);
    } catch {
      return res.json({ files: [] });
    }

    const files = filenames
      .filter((f) => !f.startsWith("."))
      .map((filename) => {
        const fullPath = path.join(outputDir, filename);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          return null;
        }
        return {
          name: filename,
          size: stat.size,
          modified: stat.mtimeMs,
          previewable: /\.(md|txt|json|log|ts|tsx|js|py|html|csv)$/.test(filename),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.modified - a!.modified));

    res.json({ files, output_dir: outputDir });
  });

  app.get("/api/tasks/:id/output/:filename", (req, res) => {
    const taskId = String(req.params.id);
    const filename = String(req.params.filename);

    const task = db
      .prepare("SELECT project_path FROM tasks WHERE id = ?")
      .get(taskId) as { project_path: string | null } | undefined;

    if (!task?.project_path) return res.status(404).json({ error: "not_found" });

    const filePath = path.join(task.project_path, "claw_output", taskId, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "not_found" });

    // Security: ensure file is within the expected project directory
    const resolved = path.resolve(filePath);
    const expectedBase = path.resolve(task.project_path);
    if (!resolved.startsWith(expectedBase)) return res.status(403).json({ error: "forbidden" });

    let content: string;
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      content = raw.slice(0, 50000); // 50kb limit
    } catch {
      return res.status(500).json({ error: "read_failed" });
    }

    res.json({ filename, content });
  });
}
