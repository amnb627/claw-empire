import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { applyBaseSchema } from "../../bootstrap/schema/base-schema.ts";
import { registerWorkflowPackRoutes } from "./workflow-packs.ts";
import { registerScheduleRoutes } from "./schedules.ts";

// ---- Fake HTTP helpers --------------------------------------------------------

type FakeResponse = {
  statusCode: number;
  payload: unknown;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
};

function createFakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    payload: null,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.payload = body; return this; },
  };
  return res;
}

// Minimal Express-like router that captures route handlers by method + path
type RouteHandler = (req: any, res: any) => any;
type RegisteredRoute = { method: string; path: string; handler: RouteHandler };

function createFakeApp() {
  const routes: RegisteredRoute[] = [];

  function register(method: string, path: string, handler: RouteHandler) {
    routes.push({ method, path, handler });
  }

  const app = {
    get: (path: string, handler: RouteHandler) => register("GET", path, handler),
    post: (path: string, handler: RouteHandler) => register("POST", path, handler),
    put: (path: string, handler: RouteHandler) => register("PUT", path, handler),
    delete: (path: string, handler: RouteHandler) => register("DELETE", path, handler),
  };

  function dispatch(method: string, path: string, body?: unknown, params?: Record<string, string>): FakeResponse {
    // Find the best matching route (prefer exact match, then pattern)
    const upper = method.toUpperCase();
    let matched: RegisteredRoute | undefined;

    for (const route of routes) {
      if (route.method !== upper) continue;
      // Convert Express param patterns like /:key/analytics to regex
      const pattern = route.path
        .replace(/:[a-zA-Z_]+/g, "([^/]+)")
        .replace(/\//g, "\\/");
      const re = new RegExp(`^${pattern}$`);
      if (re.test(path)) {
        matched = route;
        break;
      }
    }

    if (!matched) {
      const res = createFakeResponse();
      res.statusCode = 404;
      res.payload = { error: "not_found" };
      return res;
    }

    // Extract route params
    const extractedParams: Record<string, string> = { ...params };
    const paramNames: string[] = [];
    const paramPattern = matched.path.replace(/:[a-zA-Z_]+/g, (m) => {
      paramNames.push(m.slice(1));
      return "([^/]+)";
    }).replace(/\//g, "\\/");
    const paramRe = new RegExp(`^${paramPattern}$`);
    const paramMatch = path.match(paramRe);
    if (paramMatch) {
      paramNames.forEach((name, i) => {
        extractedParams[name] = paramMatch[i + 1]!;
      });
    }

    const req = {
      params: extractedParams,
      query: {} as Record<string, string>,
      body: body ?? {},
    };

    const res = createFakeResponse();
    matched.handler(req, res);
    return res;
  }

  return { app, dispatch };
}

// ---- Database helpers --------------------------------------------------------

function setupDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyBaseSchema(db);
  return db;
}

function insertPack(db: DatabaseSync, key: string, name = "Test Pack") {
  const now = Date.now();
  db.prepare(
    `INSERT INTO workflow_packs (key, name, enabled, input_schema_json, prompt_preset_json,
      qa_rules_json, output_template_json, routing_keywords_json, cost_profile_json, created_at, updated_at)
     VALUES (?, ?, 1, '{}', '{}', '{}', '{}', '[]', '{}', ?, ?)`,
  ).run(key, name, now, now);
}

function insertTask(
  db: DatabaseSync,
  opts: {
    id: string;
    workflow_pack_key: string;
    status?: string;
    created_at?: number;
    started_at?: number | null;
    completed_at?: number | null;
  },
) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO tasks (id, title, workflow_pack_key, status, created_at, updated_at, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.id,
    `Task ${opts.id}`,
    opts.workflow_pack_key,
    opts.status ?? "planned",
    opts.created_at ?? now,
    now,
    opts.started_at ?? null,
    opts.completed_at ?? null,
  );
}

function insertRevision(db: DatabaseSync, taskId: string, note: string) {
  db.prepare(
    `INSERT INTO review_revision_history (task_id, normalized_note, raw_note, first_round, created_at)
     VALUES (?, ?, ?, 1, ?)`,
  ).run(taskId, note, note, Date.now());
}

// ---- Tests -------------------------------------------------------------------

describe("Pack analytics API", () => {
  it("returns total and completed counts correctly", () => {
    const db = setupDb();
    insertPack(db, "report");
    const since = Date.now() - 10_000;
    insertTask(db, { id: "t1", workflow_pack_key: "report", status: "done", created_at: since + 100 });
    insertTask(db, { id: "t2", workflow_pack_key: "report", status: "done", created_at: since + 200 });
    insertTask(db, { id: "t3", workflow_pack_key: "report", status: "planned", created_at: since + 300 });

    const { app, dispatch } = createFakeApp();
    registerWorkflowPackRoutes({ app: app as any, db, nowMs: () => Date.now(), normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any });

    const res = dispatch("GET", "/report/analytics", undefined, { key: "report" });
    expect(res.statusCode).toBe(200);
    const payload = res.payload as any;
    expect(payload.key).toBe("report");
    expect(payload.total).toBe(3);
    expect(payload.completed).toBe(2);
  });

  it("first_pass_rate is null when no completed tasks", () => {
    const db = setupDb();
    insertPack(db, "development");
    // No tasks at all

    const { app, dispatch } = createFakeApp();
    registerWorkflowPackRoutes({ app: app as any, db, nowMs: () => Date.now(), normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any });

    const res = dispatch("GET", "/development/analytics", undefined, { key: "development" });
    expect(res.statusCode).toBe(200);
    const payload = res.payload as any;
    expect(payload.first_pass_rate).toBeNull();
    expect(payload.completed).toBe(0);
  });

  it("first_pass counts done tasks with no revision history", () => {
    const db = setupDb();
    insertPack(db, "report");
    const since = Date.now() - 10_000;
    insertTask(db, { id: "fp1", workflow_pack_key: "report", status: "done", created_at: since + 100 });
    insertTask(db, { id: "fp2", workflow_pack_key: "report", status: "done", created_at: since + 200 });
    // fp2 has a revision
    insertRevision(db, "fp2", "missing contacts section");

    const { app, dispatch } = createFakeApp();
    registerWorkflowPackRoutes({ app: app as any, db, nowMs: () => Date.now(), normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any });

    const res = dispatch("GET", "/report/analytics", undefined, { key: "report" });
    const payload = res.payload as any;
    // fp1 is first-pass (no revisions), fp2 is not
    expect(payload.first_pass).toBe(1);
    expect(payload.first_pass_rate).toBe(50);
  });

  it("returns 404 for non-existent pack", () => {
    const db = setupDb();
    const { app, dispatch } = createFakeApp();
    registerWorkflowPackRoutes({ app: app as any, db, nowMs: () => Date.now(), normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any });

    const res = dispatch("GET", "/nonexistent_pack/analytics", undefined, { key: "nonexistent_pack" });
    expect(res.statusCode).toBe(404);
  });
});

describe("task_schedules table and CRUD", () => {
  it("task_schedules table exists after schema application", () => {
    const db = setupDb();
    const result = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_schedules'`)
      .get() as { name: string } | undefined;
    expect(result?.name).toBe("task_schedules");
  });

  it("creates a schedule and reads it back", () => {
    const db = setupDb();
    const broadcast = vi.fn();
    const { app, dispatch } = createFakeApp();
    registerScheduleRoutes({
      app: app as any,
      db,
      nowMs: () => Date.now(),
      broadcast,
      normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any,
    });

    const res = dispatch("POST", "/api/schedules", {
      title_template: "Weekly Report {{date}}",
      interval_days: 7,
      workflow_pack_key: "report",
    });
    expect(res.statusCode).toBe(201);
    const payload = res.payload as any;
    expect(payload.ok).toBe(true);
    expect(payload.schedule.title_template).toBe("Weekly Report {{date}}");
    expect(payload.schedule.interval_days).toBe(7);
    expect(payload.schedule.enabled).toBe(true);
  });

  it("returns a list of schedules", () => {
    const db = setupDb();
    const broadcast = vi.fn();
    db.prepare(
      `INSERT INTO task_schedules (id, title_template, workflow_pack_key, interval_days, next_trigger_at, enabled, created_at, updated_at)
       VALUES ('s1', 'Daily Report', 'report', 1, ${Date.now() + 86400000}, 1, ${Date.now()}, ${Date.now()})`,
    ).run();

    const { app, dispatch } = createFakeApp();
    registerScheduleRoutes({
      app: app as any,
      db,
      nowMs: () => Date.now(),
      broadcast,
      normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any,
    });

    const res = dispatch("GET", "/api/schedules");
    expect(res.statusCode).toBe(200);
    const payload = res.payload as any;
    expect(payload.schedules).toHaveLength(1);
    expect(payload.schedules[0].title_template).toBe("Daily Report");
  });

  it("deletes a schedule", () => {
    const db = setupDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO task_schedules (id, title_template, workflow_pack_key, interval_days, next_trigger_at, enabled, created_at, updated_at)
       VALUES ('del-1', 'To Delete', 'report', 7, ${now + 86400000}, 1, ${now}, ${now})`,
    ).run();

    const broadcast = vi.fn();
    const { app, dispatch } = createFakeApp();
    registerScheduleRoutes({
      app: app as any,
      db,
      nowMs: () => now,
      broadcast,
      normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any,
    });

    const res = dispatch("DELETE", "/api/schedules/del-1", undefined, { id: "del-1" });
    expect(res.statusCode).toBe(200);
    const payload = res.payload as any;
    expect(payload.ok).toBe(true);

    // Verify it is actually gone
    const row = db.prepare("SELECT id FROM task_schedules WHERE id = 'del-1'").get();
    expect(row).toBeUndefined();
  });

  it("returns 400 when title_template is missing on create", () => {
    const db = setupDb();
    const broadcast = vi.fn();
    const { app, dispatch } = createFakeApp();
    registerScheduleRoutes({
      app: app as any,
      db,
      nowMs: () => Date.now(),
      broadcast,
      normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any,
    });

    const res = dispatch("POST", "/api/schedules", { interval_days: 7 });
    expect(res.statusCode).toBe(400);
    const payload = res.payload as any;
    expect(payload.error).toBe("title_template_required");
  });

  it("returns 400 when interval_days is 0 on create", () => {
    const db = setupDb();
    const broadcast = vi.fn();
    const { app, dispatch } = createFakeApp();
    registerScheduleRoutes({
      app: app as any,
      db,
      nowMs: () => Date.now(),
      broadcast,
      normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any,
    });

    const res = dispatch("POST", "/api/schedules", {
      title_template: "My Schedule",
      interval_days: 0,
    });
    expect(res.statusCode).toBe(400);
    const payload = res.payload as any;
    expect(payload.error).toBe("interval_days_must_be_positive_integer");
  });

  it("returns 404 when deleting non-existent schedule", () => {
    const db = setupDb();
    const broadcast = vi.fn();
    const { app, dispatch } = createFakeApp();
    registerScheduleRoutes({
      app: app as any,
      db,
      nowMs: () => Date.now(),
      broadcast,
      normalizeTextField: (v: any) => (typeof v === "string" ? v.trim() || null : null) as any,
    });

    const res = dispatch("DELETE", "/api/schedules/no-such-id", undefined, { id: "no-such-id" });
    expect(res.statusCode).toBe(404);
  });
});
