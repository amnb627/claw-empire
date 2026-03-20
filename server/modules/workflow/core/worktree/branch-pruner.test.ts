import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { pruneStaleClimpireBranches } from './branch-pruner.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe', timeout: 15000 }).toString().trim();
}

function initRepo(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    runGit(dir, ['init', '-b', 'main']);
  } catch {
    runGit(dir, ['init']);
    runGit(dir, ['checkout', '-B', 'main']);
  }
  runGit(dir, ['config', 'user.name', 'Pruner Test']);
  runGit(dir, ['config', 'user.email', 'pruner@test.local']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'seed\n', 'utf8');
  runGit(dir, ['add', '.']);
  runGit(dir, ['commit', '-m', 'seed']);
  return dir;
}

function createTasksDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inbox'
    )
  `);
  return db;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('pruneStaleClimpireBranches', () => {
  it('prunes a climpire branch that has no matching active task', async () => {
    const repo = initRepo('pruner-stale-');
    tempDirs.push(repo);
    const staleShortId = 'deada1b2';
    runGit(repo, ['branch', `climpire/${staleShortId}`]);

    const db = createTasksDb();
    try {
      const { pruned, errors } = await pruneStaleClimpireBranches(db, repo);
      expect(errors).toHaveLength(0);
      expect(pruned).toContain(`climpire/${staleShortId}`);

      // Verify branch is gone
      const remainingBranches = runGit(repo, ['branch', '--list', 'climpire/*']);
      expect(remainingBranches).not.toContain(staleShortId);
    } finally {
      db.close();
    }
  });

  it('skips branches for active tasks', async () => {
    const repo = initRepo('pruner-active-');
    tempDirs.push(repo);
    const activeShortId = 'aaaabbbb';
    const activeTaskId = `${activeShortId}-0000-0000-0000-000000000000`;
    runGit(repo, ['branch', `climpire/${activeShortId}`]);

    const db = createTasksDb();
    try {
      // Insert as an in_progress task
      db.prepare("INSERT INTO tasks (id, title, status) VALUES (?, 'Active Task', 'in_progress')").run(activeTaskId);

      const { pruned, errors } = await pruneStaleClimpireBranches(db, repo);
      expect(errors).toHaveLength(0);
      expect(pruned).not.toContain(`climpire/${activeShortId}`);

      // Branch should still exist
      const remaining = runGit(repo, ['branch', '--list', 'climpire/*']);
      expect(remaining).toContain(activeShortId);
    } finally {
      db.close();
      // Cleanup leftover branch
      try { runGit(repo, ['branch', '-D', `climpire/${activeShortId}`]); } catch { /* */ }
    }
  });

  it('handles a non-git directory gracefully (returns error, does not throw)', async () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pruner-nongit-'));
    tempDirs.push(nonGitDir);

    const db = createTasksDb();
    try {
      const { pruned, errors } = await pruneStaleClimpireBranches(db, nonGitDir);
      expect(pruned).toHaveLength(0);
      expect(errors.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it('returns empty pruned/errors when there are no climpire/* branches', async () => {
    const repo = initRepo('pruner-empty-');
    tempDirs.push(repo);

    const db = createTasksDb();
    try {
      const { pruned, errors } = await pruneStaleClimpireBranches(db, repo);
      expect(pruned).toHaveLength(0);
      expect(errors).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('prunes stale but keeps active when both exist', async () => {
    const repo = initRepo('pruner-mixed-');
    tempDirs.push(repo);

    const staleShortId = 'ffff0001';
    const activeShortId = 'eeee0002';
    const activeTaskId = `${activeShortId}-0000-0000-0000-000000000000`;

    runGit(repo, ['branch', `climpire/${staleShortId}`]);
    runGit(repo, ['branch', `climpire/${activeShortId}`]);

    const db = createTasksDb();
    try {
      db.prepare("INSERT INTO tasks (id, title, status) VALUES (?, 'Active', 'review')").run(activeTaskId);

      const { pruned, errors } = await pruneStaleClimpireBranches(db, repo);
      expect(errors).toHaveLength(0);
      expect(pruned).toContain(`climpire/${staleShortId}`);
      expect(pruned).not.toContain(`climpire/${activeShortId}`);
    } finally {
      db.close();
      try { runGit(repo, ['branch', '-D', `climpire/${activeShortId}`]); } catch { /* */ }
    }
  });
});
