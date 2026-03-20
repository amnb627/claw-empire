import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { checkRequiredSections } from '../qa/section-parser.ts';

export interface PeerReviewOptions {
  taskId: string;
  primaryAgentId: string;
  primaryResult: string;
  packKey: string;
  db: DatabaseSync;
  broadcast: (type: string, data: unknown) => void;
}

export interface PeerReviewResult {
  passed: boolean;
  score: number; // 0–100
  feedback: string;
  missingRequirements: string[];
  meetingId: string;
}

interface QaRules {
  requiredSections?: string[];
  failOnMissingSections?: boolean;
  rules?: string[];
}

/**
 * Run a lightweight rule-based peer review of task output.
 * Checks output against the pack's qa_rules_json.
 * Returns result synchronously (no LLM call — pure heuristic).
 */
export function runPeerReview(opts: PeerReviewOptions): PeerReviewResult {
  const now = Date.now();
  const meetingId = randomUUID();

  // Fetch QA rules for this pack
  const pack = (opts.db.prepare(
    'SELECT qa_rules_json FROM workflow_packs WHERE key = ?',
  ).get(opts.packKey)) as { qa_rules_json: string } | undefined;

  let qaRules: QaRules = {};
  try {
    qaRules = JSON.parse(pack?.qa_rules_json ?? '{}') as QaRules;
  } catch {
    /* malformed JSON — treat as empty rules */
  }

  const result = opts.primaryResult ?? '';

  // --- Required sections check (via section-parser) ---
  const sectionCheck = checkRequiredSections(result, qaRules.requiredSections ?? []);
  const missing = sectionCheck.missing;

  // --- Custom rules (keyword-based heuristics) ---
  const failedRules: string[] = [];
  for (const rule of qaRules.rules ?? []) {
    if (/must begin with.*action verb/i.test(rule)) {
      const checklistItems = result.match(/^- \[[ x]\] (.+)$/gm) ?? [];
      const actionVerbs =
        /^(確認|Send|Check|Review|Update|Create|Fix|Prepare|Submit|Contact|書|連絡|送|確|作|見)/i;
      const badItems = checklistItems.filter(item => !actionVerbs.test(item.slice(6)));
      if (badItems.length > 0) {
        failedRules.push(
          `Checklist items not starting with action verb: ${badItems.slice(0, 2).join(', ')}`,
        );
      }
    }
    if (/at least one P0 item/i.test(rule) && !result.includes('P0')) {
      failedRules.push('No P0 priority item in agenda');
    }
  }

  const passed = missing.length === 0 && failedRules.length === 0;
  const score = Math.max(
    0,
    100 - missing.length * 20 - failedRules.length * 10,
  );
  const feedback = [
    passed ? '✅ All QA checks passed.' : '❌ QA checks failed.',
    missing.length > 0 ? `Missing sections: ${missing.join(', ')}` : '',
    ...failedRules,
  ]
    .filter(Boolean)
    .join('\n');

  // --- Record the peer review as a meeting ---
  opts.db
    .prepare(
      `INSERT INTO meeting_minutes (id, task_id, meeting_type, round, title, status, started_at, completed_at)
       VALUES (?, ?, 'peer_review', 1, ?, ?, ?, ?)`,
    )
    .run(
      meetingId,
      opts.taskId,
      `Peer Review: ${opts.packKey}`,
      passed ? 'completed' : 'revision_requested',
      now,
      now,
    );

  opts.db
    .prepare(
      `INSERT INTO meeting_minute_entries (meeting_id, seq, speaker_name, department_name, role_label, message_type, content)
       VALUES (?, 1, 'QA Reviewer', 'Quality', 'Automated QA', 'report', ?)`,
    )
    .run(meetingId, feedback);

  // --- On failure: record each issue in revision history ---
  if (!passed) {
    const notes = [
      ...missing.map(m => `Missing section: ${m}`),
      ...failedRules,
    ];
    for (const note of notes) {
      try {
        opts.db
          .prepare(
            `INSERT OR IGNORE INTO review_revision_history (task_id, normalized_note, raw_note, first_round)
             VALUES (?, ?, ?, ?)`,
          )
          .run(opts.taskId, note.toLowerCase().slice(0, 200), note, 1);
      } catch {
        /* UNIQUE constraint hit — already recorded */
      }
    }
  }

  opts.broadcast('meeting_minute', {
    taskId: opts.taskId,
    meetingId,
    type: 'peer_review',
    passed,
    score,
  });

  return { passed, score, feedback, missingRequirements: missing, meetingId };
}
