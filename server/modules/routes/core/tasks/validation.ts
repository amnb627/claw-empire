/**
 * Task Input Validation — Shared helpers for task creation and update endpoints.
 *
 * Provides length limits, type coercion, and safe parsing for task fields
 * to prevent oversized payloads, NaN values, and unexpected types.
 */

/** Maximum allowed lengths for text fields. */
const LIMITS = {
  title: 500,
  description: 50_000,
  result: 100_000,
  outputFormat: 2_000,
  baseBranch: 200,
  workflowMetaJson: 100_000,
} as const;

const VALID_STATUSES = new Set([
  "inbox",
  "planned",
  "collaborating",
  "in_progress",
  "review",
  "done",
  "cancelled",
  "pending",
]);

const VALID_TASK_TYPES = new Set([
  "general",
  "development",
  "design",
  "analysis",
  "presentation",
  "documentation",
]);

export interface TaskCreateInput {
  title: string;
  description: string | null;
  department_id: string | null;
  assigned_agent_id: string | null;
  project_id: string | null;
  project_path: string | null;
  status: string;
  priority: number;
  task_type: string;
  workflow_pack_key: string | null;
  workflow_meta_json: string | null;
  output_format: string | null;
  base_branch: string | null;
  chain_to_task_id: string | null;
}

/**
 * Parse a value as a bounded positive integer, returning a fallback on failure.
 */
export function parseBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === null || value === undefined) return fallback;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

/**
 * Truncate a string field to a maximum length, returning null if empty.
 */
export function truncateField(
  value: unknown,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Validate and extract task creation fields from a raw request body.
 * Returns either a validated input object or an error.
 */
export function validateTaskCreateBody(
  body: unknown,
  normalizeTextField: (v: unknown) => string | null,
): { ok: true; data: TaskCreateInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body_required" };
  }

  const b = body as Record<string, unknown>;

  // Title: required, non-empty, bounded length
  const title = truncateField(b.title, LIMITS.title);
  if (!title) {
    return { ok: false, error: "title_required" };
  }

  // Status: must be valid enum value
  const rawStatus = typeof b.status === "string" ? b.status : "inbox";
  if (!VALID_STATUSES.has(rawStatus)) {
    return { ok: false, error: "invalid_status" };
  }

  // Task type: must be valid enum value
  const rawTaskType = typeof b.task_type === "string" ? b.task_type : "general";
  if (!VALID_TASK_TYPES.has(rawTaskType)) {
    return { ok: false, error: "invalid_task_type" };
  }

  // Priority: integer in safe range
  const priority = parseBoundedInt(b.priority, 0, -1000, 1000);

  // Workflow meta JSON: coerce object to string
  let workflowMetaJson: string | null = null;
  if (typeof b.workflow_meta_json === "string") {
    workflowMetaJson = truncateField(b.workflow_meta_json, LIMITS.workflowMetaJson);
  } else if (b.workflow_meta_json != null && typeof b.workflow_meta_json === "object") {
    workflowMetaJson = truncateField(
      JSON.stringify(b.workflow_meta_json),
      LIMITS.workflowMetaJson,
    );
  }

  return {
    ok: true,
    data: {
      title,
      description: truncateField(b.description, LIMITS.description),
      department_id: normalizeTextField(b.department_id),
      assigned_agent_id: normalizeTextField(b.assigned_agent_id),
      project_id: normalizeTextField(b.project_id),
      project_path: normalizeTextField(b.project_path),
      status: rawStatus,
      priority,
      task_type: rawTaskType,
      workflow_pack_key: normalizeTextField(b.workflow_pack_key),
      workflow_meta_json: workflowMetaJson,
      output_format: truncateField(b.output_format, LIMITS.outputFormat),
      base_branch: truncateField(b.base_branch, LIMITS.baseBranch),
      chain_to_task_id: normalizeTextField(b.chain_to_task_id),
    },
  };
}
