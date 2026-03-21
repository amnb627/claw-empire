import { execFileSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";

/**
 * Prune stale climpire/* branches that have no associated active task.
 * Safe: only deletes branches matching the `climpire/` prefix.
 *
 * A branch is considered "stale" when its short-id (first 8 chars after
 * `climpire/`) does not match any task currently in an active status.
 */
export async function pruneStaleClimpireBranches(
  db: DatabaseSync,
  projectPath: string,
): Promise<{ pruned: string[]; errors: string[] }> {
  const pruned: string[] = [];
  const errors: string[] = [];

  try {
    // List all climpire/* local branches
    const output = execFileSync("git", ["branch", "--list", "climpire/*"], {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 10000,
    });

    const branches = output
      .split("\n")
      .map((b) => b.trim().replace(/^\*\s*/, ""))
      .filter((b) => b.startsWith("climpire/"));

    if (branches.length === 0) {
      return { pruned, errors };
    }

    // Collect short-ids of all currently active tasks (not done / cancelled)
    const activeTasks = db
      .prepare(`SELECT id FROM tasks WHERE status IN ('inbox','planned','in_progress','review','collaborating')`)
      .all() as Array<{ id: string }>;
    const activeShortIds = new Set(activeTasks.map((t) => t.id.slice(0, 8)));

    for (const branch of branches) {
      // branch name is `climpire/<shortId>` or `climpire/<shortId>-<n>`
      const afterPrefix = branch.replace(/^climpire\//, "");
      const shortId = afterPrefix.slice(0, 8);
      if (activeShortIds.has(shortId)) continue; // branch belongs to an active task

      try {
        execFileSync("git", ["branch", "-D", branch], {
          cwd: projectPath,
          encoding: "utf-8",
          timeout: 5000,
        });
        pruned.push(branch);
      } catch (e) {
        errors.push(`${branch}: ${String(e).slice(0, 100)}`);
      }
    }
  } catch (e) {
    // Not a git repo, git unavailable, or project path invalid
    errors.push(String(e).slice(0, 200));
  }

  if (pruned.length > 0) {
    console.log(`[BranchPruner] Pruned ${pruned.length} stale branches: ${pruned.join(", ")}`);
  }

  return { pruned, errors };
}
