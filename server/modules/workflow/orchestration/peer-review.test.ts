import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { runPeerReview } from './peer-review.ts';
import type { PeerReviewOptions } from './peer-review.ts';

// ---------------------------------------------------------------------------
// Minimal DB that includes all tables peer-review touches
// ---------------------------------------------------------------------------
function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inbox'
    );

    CREATE TABLE workflow_packs (
      key TEXT PRIMARY KEY,
      qa_rules_json TEXT NOT NULL
    );

    CREATE TABLE meeting_minutes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      meeting_type TEXT NOT NULL CHECK(meeting_type IN ('planned','review','peer_review')),
      round INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE meeting_minute_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      speaker_name TEXT NOT NULL,
      department_name TEXT,
      role_label TEXT,
      message_type TEXT NOT NULL,
      content TEXT NOT NULL
    );

    CREATE TABLE review_revision_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      normalized_note TEXT NOT NULL,
      raw_note TEXT NOT NULL,
      first_round INTEGER NOT NULL,
      UNIQUE(task_id, normalized_note)
    );
  `);
  return db;
}

function seedPack(
  db: DatabaseSync,
  key: string,
  qaRules: Record<string, unknown>,
): void {
  db.prepare('INSERT INTO workflow_packs (key, qa_rules_json) VALUES (?, ?)').run(
    key,
    JSON.stringify(qaRules),
  );
}

function seedTask(db: DatabaseSync, id: string): void {
  db.prepare("INSERT INTO tasks (id, title, status) VALUES (?, 'Test Task', 'in_progress')").run(id);
}

function makeOpts(
  db: DatabaseSync,
  overrides: Partial<PeerReviewOptions> = {},
): PeerReviewOptions {
  return {
    taskId: 'task-001',
    primaryAgentId: 'agent-001',
    primaryResult: '',
    packKey: 'facility_visit',
    db,
    broadcast: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runPeerReview', () => {
  it('returns passed=true when all required sections are present', () => {
    const db = createDb();
    try {
      seedTask(db, 'task-001');
      seedPack(db, 'facility_visit', {
        requiredSections: ['contacts', 'checklist', 'agenda'],
        failOnMissingSections: true,
      });

      const result = `
## Contacts

John Doe

## Checklist

- [ ] Confirm visit

## Agenda

P0: Demo
`.trim();

      const rv = runPeerReview(makeOpts(db, { primaryResult: result }));
      expect(rv.passed).toBe(true);
      expect(rv.score).toBe(100);
      expect(rv.missingRequirements).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('returns passed=false when required sections are missing', () => {
    const db = createDb();
    try {
      seedTask(db, 'task-001');
      seedPack(db, 'facility_visit', {
        requiredSections: ['contacts', 'checklist', 'agenda', 'contract', 'followup'],
        failOnMissingSections: true,
      });

      // Only contacts present — all others missing
      const result = '## Contacts\n\nJohn Doe\n';

      const rv = runPeerReview(makeOpts(db, { primaryResult: result }));
      expect(rv.passed).toBe(false);
      expect(rv.missingRequirements.length).toBeGreaterThan(0);
      expect(rv.missingRequirements).toContain('checklist');
    } finally {
      db.close();
    }
  });

  it('records a meeting_minutes row with type peer_review', () => {
    const db = createDb();
    try {
      seedTask(db, 'task-001');
      seedPack(db, 'facility_visit', {
        requiredSections: ['contacts'],
        failOnMissingSections: true,
      });

      runPeerReview(makeOpts(db, { primaryResult: '## Contacts\n\nHello\n' }));

      const row = db
        .prepare("SELECT meeting_type FROM meeting_minutes WHERE task_id = 'task-001'")
        .get() as { meeting_type: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.meeting_type).toBe('peer_review');
    } finally {
      db.close();
    }
  });

  it('records a meeting_minute_entries row with the feedback', () => {
    const db = createDb();
    try {
      seedTask(db, 'task-001');
      seedPack(db, 'facility_visit', {
        requiredSections: ['contacts'],
        failOnMissingSections: true,
      });

      const rv = runPeerReview(makeOpts(db, { primaryResult: '## Contacts\n\nHello\n' }));

      const entry = db
        .prepare('SELECT content FROM meeting_minute_entries WHERE meeting_id = ?')
        .get(rv.meetingId) as { content: string } | undefined;
      expect(entry).toBeDefined();
      expect(entry!.content).toContain('QA checks passed');
    } finally {
      db.close();
    }
  });

  it('adds to review_revision_history when peer review fails', () => {
    const db = createDb();
    try {
      seedTask(db, 'task-fail');
      seedPack(db, 'facility_visit', {
        requiredSections: ['contacts', 'agenda'],
        failOnMissingSections: true,
      });

      runPeerReview(
        makeOpts(db, {
          taskId: 'task-fail',
          primaryResult: '## Contacts\n\nHello\n',
        }),
      );

      const history = db
        .prepare("SELECT * FROM review_revision_history WHERE task_id = 'task-fail'")
        .all() as Array<{ raw_note: string }>;
      expect(history.length).toBeGreaterThan(0);
      expect(history.some(h => h.raw_note.toLowerCase().includes('agenda'))).toBe(true);
    } finally {
      db.close();
    }
  });

  it('does NOT add to revision history when peer review passes', () => {
    const db = createDb();
    try {
      seedTask(db, 'task-pass');
      seedPack(db, 'facility_visit', {
        requiredSections: ['contacts'],
        failOnMissingSections: true,
      });

      runPeerReview(
        makeOpts(db, {
          taskId: 'task-pass',
          primaryResult: '## Contacts\n\nHello\n',
        }),
      );

      const history = db
        .prepare("SELECT * FROM review_revision_history WHERE task_id = 'task-pass'")
        .all();
      expect(history).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('broadcasts a meeting_minute event with passed/score', () => {
    const db = createDb();
    try {
      seedTask(db, 'task-001');
      seedPack(db, 'facility_visit', {
        requiredSections: ['contacts'],
        failOnMissingSections: true,
      });

      const broadcastSpy = vi.fn();
      runPeerReview(
        makeOpts(db, {
          primaryResult: '## Contacts\n\nHello\n',
          broadcast: broadcastSpy,
        }),
      );

      expect(broadcastSpy).toHaveBeenCalledWith(
        'meeting_minute',
        expect.objectContaining({ type: 'peer_review', passed: true }),
      );
    } finally {
      db.close();
    }
  });

  it('handles missing pack gracefully (treats as no rules)', () => {
    const db = createDb();
    try {
      seedTask(db, 'task-001');
      // No pack inserted — should not throw, should treat as passed (no required sections)

      expect(() => runPeerReview(makeOpts(db, { primaryResult: 'any content' }))).not.toThrow();
      const rv = runPeerReview(makeOpts(db, { taskId: 'task-001', primaryResult: 'any content' }));
      expect(rv.passed).toBe(true);
    } finally {
      db.close();
    }
  });

  it('score decreases by 20 per missing section', () => {
    const db = createDb();
    try {
      seedTask(db, 'task-001');
      seedPack(db, 'facility_visit', {
        requiredSections: ['contacts', 'agenda', 'contract'],
        failOnMissingSections: true,
      });

      // All three sections missing
      const rv = runPeerReview(makeOpts(db, { primaryResult: 'no headings here' }));
      expect(rv.score).toBe(40); // 100 - 3*20 = 40
    } finally {
      db.close();
    }
  });
});
