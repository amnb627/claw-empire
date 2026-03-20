import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface ExtractionInput {
  taskId: string;
  projectId: string | null;
  provider: string;
  title: string;
  description: string | null;
  result: string | null;
  packKey: string | null;
  db: DatabaseSync;
}

/**
 * Extract project-specific learnings from a completed task and store them.
 * This is a lightweight heuristic extractor — no LLM call required.
 */
export function extractAndStoreInsights(input: ExtractionInput): number {
  if (!input.projectId || !input.result) return 0;

  const insights = extractInsights(input);
  if (insights.length === 0) return 0;

  let stored = 0;
  for (const insight of insights) {
    // Avoid near-duplicates (simple check: if insight text is very similar to existing)
    const existing = input.db
      .prepare(
        `
      SELECT id FROM agent_project_memory
      WHERE project_id = ? AND insight = ?
    `,
      )
      .get(input.projectId, insight.text);

    if (existing) {
      // Increment confidence on confirmation
      input.db
        .prepare(
          `
        UPDATE agent_project_memory
        SET confidence = MIN(10, confidence + 1), updated_at = ?
        WHERE project_id = ? AND insight = ?
      `,
        )
        .run(Date.now(), input.projectId, insight.text);
    } else {
      input.db
        .prepare(
          `
        INSERT INTO agent_project_memory
        (id, project_id, provider, insight, category, source_task_id, confidence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          randomUUID(),
          input.projectId,
          input.provider,
          insight.text,
          insight.category,
          input.taskId,
          insight.confidence,
          Date.now(),
          Date.now(),
        );
      stored++;
    }
  }

  return stored;
}

interface ExtractedInsight {
  text: string;
  category: "convention" | "tool" | "command" | "preference" | "warning" | "fact" | "general";
  confidence: number;
}

function extractInsights(input: ExtractionInput): ExtractedInsight[] {
  const insights: ExtractedInsight[] = [];
  const result = input.result ?? "";
  const lines = result.split("\n");

  // Pattern 1: Commands used successfully
  const commandPatterns = [
    /```(?:bash|sh|shell|cmd|powershell)?\n(.*?)\n```/gs,
    /\$ ([\w\-\/\.]+(?:\s+[\w\-\/\.]+){1,5})/g,
  ];
  let commandCount = 0;
  for (const pattern of commandPatterns) {
    if (commandCount >= 3) break;
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(result)) !== null) {
      const cmd = m[1]?.trim();
      if (cmd && cmd.length < 120 && cmd.length > 5) {
        insights.push({
          text: `Command that works: \`${cmd.slice(0, 100)}\``,
          category: "command",
          confidence: 6,
        });
        commandCount++;
        if (commandCount >= 3) break;
      }
    }
  }

  // Pattern 2: File conventions mentioned
  const fileConventions = lines
    .filter((l) => /\.(ts|tsx|js|py|md|json)\b/.test(l) && l.length < 200)
    .filter((l) => /convention|pattern|always|should|must|prefer/.test(l.toLowerCase()))
    .slice(0, 2);
  for (const line of fileConventions) {
    insights.push({
      text: line.trim().slice(0, 120),
      category: "convention",
      confidence: 5,
    });
  }

  // Pattern 3: Pack-specific learnings
  if (input.packKey === "facility_visit") {
    // For visit prep, note if contacts/contracts were found
    if (/連絡先|contact/i.test(result)) {
      insights.push({
        text: "Visit prep: contact table was successfully populated",
        category: "fact",
        confidence: 5,
      });
    }
  }

  // Pattern 4: Warnings/errors encountered and resolved
  const warningLines = lines
    .filter((l) => /⚠️|warning:|fixed:|resolved:|workaround:/i.test(l) && l.length < 200)
    .slice(0, 2);
  for (const line of warningLines) {
    insights.push({ text: line.trim().slice(0, 120), category: "warning", confidence: 6 });
  }

  // Deduplicate and limit total
  return deduplicate(insights).slice(0, 5);
}

function deduplicate(insights: ExtractedInsight[]): ExtractedInsight[] {
  const seen = new Set<string>();
  return insights.filter((i) => {
    const key = i.text.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
