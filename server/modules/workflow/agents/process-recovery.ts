import type { DatabaseSync } from 'node:sqlite';
import { createProcessTools } from './providers/process-tools.ts';

export async function reconcileOrphanedProcesses(db: DatabaseSync): Promise<void> {
  const rows = db.prepare(
    'SELECT task_id, pid, worktree_path FROM active_cli_processes'
  ).all() as Array<{ task_id: string; pid: number; worktree_path: string | null }>;

  if (rows.length === 0) return;

  console.log(`[ProcessRecovery] ${rows.length} orphaned CLI process(es) from previous run`);

  const { killPidTree } = createProcessTools({ db: db as any, nowMs: () => Date.now() });

  for (const row of rows) {
    let alive = false;
    try { process.kill(row.pid, 0); alive = true; } catch { alive = false; }

    if (alive) {
      console.log(`[ProcessRecovery] Killing PID ${row.pid} (task ${row.task_id})`);
      try { killPidTree(row.pid); } catch { /* best effort */ }
    }

    try {
      db.prepare(`UPDATE tasks SET status = 'inbox', updated_at = ? WHERE id = ? AND status = 'in_progress'`)
        .run(Date.now(), row.task_id);
    } catch { /* non-fatal */ }
  }

  db.prepare('DELETE FROM active_cli_processes').run();
  console.log('[ProcessRecovery] Reconciliation complete');
}
