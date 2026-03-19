/**
 * XP Scoring Calculator for Agent Progression
 *
 * Replaces the hardcoded +10 XP with a multi-factor formula:
 *   Total XP = base + complexity + type + collaboration + subtask + streak
 *
 * Range: 10–60 XP per task (base 10, up to +50 bonuses)
 */

export interface XpContext {
  /** Task priority (0+). Higher = more complex. */
  priority: number;
  /** Task type enum value */
  taskType: string | null;
  /** Non-null if this is a collaboration child task */
  sourceTaskId: string | null;
  /** Number of subtasks attached to this task */
  subtaskCount: number;
  /** Agent role: team_leader, senior, junior, intern */
  agentRole: string;
  /** Number of recent consecutive successful completions by this agent (0–5+) */
  streakCount: number;
}

export interface XpBreakdown {
  base: number;
  complexity: number;
  type: number;
  collaboration: number;
  subtask: number;
  streak: number;
  total: number;
}

const TYPE_BONUS: Record<string, number> = {
  development: 5,
  analysis: 5,
  design: 3,
  presentation: 2,
  documentation: 1,
  general: 0,
};

/**
 * Calculate XP reward for a completed task.
 *
 * @returns Detailed breakdown and total XP
 */
export function calculateXp(ctx: XpContext): XpBreakdown {
  const base = 10;

  // Complexity bonus: priority * 2, capped at 20
  const complexity = Math.min(Math.max(ctx.priority, 0) * 2, 20);

  // Task type bonus: 0–5 based on task_type
  const type = TYPE_BONUS[ctx.taskType ?? "general"] ?? 0;

  // Collaboration bonus: +5 if this is a delegated child task
  const collaboration = ctx.sourceTaskId ? 5 : 0;

  // Subtask bonus: +2 per subtask, capped at 10
  const subtask = Math.min(Math.max(ctx.subtaskCount, 0) * 2, 10);

  // Streak bonus: +5 at 3-streak, +10 at 5-streak
  const streak = ctx.streakCount >= 5 ? 10 : ctx.streakCount >= 3 ? 5 : 0;

  const total = base + complexity + type + collaboration + subtask + streak;

  return { base, complexity, type, collaboration, subtask, streak, total };
}

/**
 * Query helper: count recent consecutive successes for an agent.
 * Looks at the last N tasks assigned to this agent, ordered by completion time desc,
 * and counts how many consecutive 'done' or 'review' statuses from the top.
 */
export function countAgentStreak(
  db: { prepare: (sql: string) => { all: (...args: unknown[]) => Array<{ status: string }> } },
  agentId: string,
  limit = 10,
): number {
  const rows = db
    .prepare(
      "SELECT status FROM tasks WHERE assigned_agent_id = ? AND status IN ('done', 'review', 'inbox', 'cancelled') ORDER BY updated_at DESC LIMIT ?",
    )
    .all(agentId, limit);

  let streak = 0;
  for (const row of rows) {
    if (row.status === "done" || row.status === "review") {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Query helper: count subtasks for a task.
 */
export function countSubtasks(
  db: { prepare: (sql: string) => { get: (...args: unknown[]) => { cnt: number } | undefined } },
  taskId: string,
): number {
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM subtasks WHERE task_id = ?").get(taskId);
  return Number(row?.cnt ?? 0);
}
