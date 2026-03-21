import { readFileSync, existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

export interface PromptEnrichmentOptions {
  taskId: string;
  projectId: string | null;
  workflowMetaJson: string | null;
  projectPath: string | null;
  db: DatabaseSync;
}

export interface EnrichmentResult {
  contextBlock: string; // prepended to the main prompt
  injectedFiles: string[]; // list of file paths actually injected
  injectedSkills: string[]; // list of skill keys injected (for logging)
}

/**
 * Builds an enrichment block to prepend to the agent's prompt.
 *
 * Sections (in order):
 *   1. Context Files   — files listed in workflow_meta_json.context_files
 *   2. Facility ZK     — ZK Permanent note for meta.facility (if found)
 *   3. Project Memory  — high-confidence rows from agent_project_memory (if table exists)
 */
export async function enrichPrompt(opts: PromptEnrichmentOptions): Promise<EnrichmentResult> {
  const result: EnrichmentResult = { contextBlock: "", injectedFiles: [], injectedSkills: [] };
  const sections: string[] = [];

  // Parse meta
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(opts.workflowMetaJson ?? "{}");
  } catch {
    /* ok — invalid JSON is treated as empty */
  }

  // --- Section 1: Context Files ---
  const contextFiles = Array.isArray(meta.context_files) ? (meta.context_files as string[]) : [];
  if (contextFiles.length > 0) {
    const fileBlocks: string[] = [];
    for (const filePath of contextFiles.slice(0, 10)) {
      // max 10 files
      if (typeof filePath !== "string") continue;
      if (!existsSync(filePath)) {
        fileBlocks.push(`<!-- File not found: ${filePath} -->`);
        continue;
      }
      try {
        const content = readFileSync(filePath, "utf-8");
        const truncated = content.length > 8000 ? content.slice(0, 8000) + "\n...[truncated]" : content;
        fileBlocks.push(`### ${filePath}\n\`\`\`\n${truncated}\n\`\`\``);
        result.injectedFiles.push(filePath);
      } catch (e) {
        fileBlocks.push(`<!-- Could not read: ${filePath} — ${String(e)} -->`);
      }
    }
    if (fileBlocks.length > 0) {
      sections.push(`## Context Files\n\n${fileBlocks.join("\n\n")}`);
    }
  }

  // --- Section 2: ZK Facility Auto-inject ---
  const facility = typeof meta.facility === "string" ? meta.facility : null;
  if (facility) {
    const zkNote = findFacilityZkNote(facility, opts.projectPath);
    if (zkNote) {
      sections.push(`## Facility Knowledge Base: ${facility}\n\n${zkNote}`);
      result.injectedFiles.push(`[ZK:${facility}]`);
    }
  }

  // --- Section 3: Agent Project Memory (reserved for skill-injector.ts) ---
  // Reads from agent_project_memory when table exists.
  try {
    const tableExists =
      opts.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='agent_project_memory'`).get() !=
      null;

    if (tableExists && opts.projectId) {
      const memories = opts.db
        .prepare(
          `
        SELECT insight FROM agent_project_memory
        WHERE project_id = ? AND confidence >= 6
        ORDER BY use_count DESC, last_used_at DESC
        LIMIT 8
      `,
        )
        .all(opts.projectId) as Array<{ insight: string }>;

      if (memories.length > 0) {
        const bullets = memories.map((m) => `- ${m.insight}`).join("\n");
        sections.push(`## Project Memory (learned patterns)\n\n${bullets}`);
        result.injectedSkills = memories.map((m) => m.insight.slice(0, 40));
      }
    }
  } catch {
    /* table doesn't exist yet, skip gracefully */
  }

  result.contextBlock =
    sections.length > 0
      ? `<!-- === Injected Context === -->\n${sections.join("\n\n")}\n<!-- === End Context === -->\n\n`
      : "";

  return result;
}

/** Search for a facility's ZK Permanent note in the known vault paths. */
export function findFacilityZkNote(facility: string, _projectPath: string | null): string | null {
  const zkBasePaths = [
    "C:\\MS\\OneDrive - Siemens Healthineers\\000_RC\\00_Inbox\\10_Knowledge\\01_ZettelKasten\\03_Permanent",
  ];

  const facilityFileMap: Record<string, string[]> = {
    三重大学: ["三重大学.md", "Mie_University.md"],
    東北大学: ["東北大学.md", "Tohoku_University.md"],
    NCVC: ["NCVC.md", "国立循環器病研究センター.md"],
    京都大学: ["京都大学.md", "Kyoto_University.md"],
    名古屋大学: ["名古屋大学.md", "Nagoya_University.md"],
    日本医科大学: ["日本医科大学.md", "Nippon_Medical.md"],
    旭川医科大学: ["旭川医科大学.md", "Asahikawa_Medical_University.md"],
  };

  const candidates = facilityFileMap[facility] ?? [`${facility}.md`];

  for (const basePath of zkBasePaths) {
    for (const filename of candidates) {
      const fullPath = `${basePath}\\${filename}`;
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          return content.length > 4000 ? content.slice(0, 4000) + "\n...[truncated]" : content;
        } catch {
          /* skip */
        }
      }
    }
  }
  return null;
}
