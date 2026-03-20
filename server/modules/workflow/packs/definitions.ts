export const BUILTIN_PACK_KEYS = [
  "development",
  "novel",
  "report",
  "video_preprod",
  "web_research_report",
  "roleplay",
  "facility_visit",
] as const;
export type BuiltinPackKey = (typeof BUILTIN_PACK_KEYS)[number];

// Keep old export for backwards compat
export const WORKFLOW_PACK_KEYS = BUILTIN_PACK_KEYS;
export type WorkflowPackKey = BuiltinPackKey;

export const DEFAULT_WORKFLOW_PACK_KEY: WorkflowPackKey = "development";

// Runtime registry populated from DB (includes builtins + user-defined packs)
let _knownPackKeys: Set<string> = new Set(BUILTIN_PACK_KEYS);

export function initPackRegistry(packKeys: string[]): void {
  _knownPackKeys = new Set([...BUILTIN_PACK_KEYS, ...packKeys]);
}

export function isKnownPackKey(value: unknown): value is string {
  return typeof value === "string" && _knownPackKeys.has(value);
}

// Keep for backwards compat (only matches compile-time builtins)
export function isWorkflowPackKey(value: unknown): value is WorkflowPackKey {
  return typeof value === "string" && (BUILTIN_PACK_KEYS as readonly string[]).includes(value);
}

export type WorkflowPackSeed = {
  key: WorkflowPackKey;
  name: string;
  inputSchema: Record<string, unknown>;
  promptPreset: Record<string, unknown>;
  qaRules: Record<string, unknown>;
  outputTemplate: Record<string, unknown>;
  routingKeywords: string[];
  costProfile: Record<string, unknown>;
};

const COMMON_COST_PROFILE = {
  maxInputTokens: 12000,
  maxOutputTokens: 6000,
  maxRounds: 3,
};

export const DEFAULT_WORKFLOW_PACK_SEEDS: WorkflowPackSeed[] = [
  {
    key: "development",
    name: "Development",
    inputSchema: {
      required: ["project", "instruction"],
      optional: ["constraints", "acceptance_criteria", "deadline"],
    },
    promptPreset: {
      mode: "engineering",
      style: "pragmatic",
      enforceTests: true,
    },
    qaRules: {
      requireTestEvidence: true,
      requireRiskNotes: true,
      maxAutoFixPasses: 1,
    },
    outputTemplate: {
      sections: ["summary", "changes", "verification", "next_steps"],
    },
    routingKeywords: ["fix", "bug", "refactor", "build", "api", "test", "개발", "버그", "수정", "코드"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      defaultReasoning: "high",
    },
  },
  {
    key: "novel",
    name: "Novel Writing",
    inputSchema: {
      required: ["genre", "tone", "length"],
      optional: ["characters", "world_setting", "point_of_view"],
    },
    promptPreset: {
      mode: "creative_writing",
      keepCharacterConsistency: true,
    },
    qaRules: {
      checkToneConsistency: true,
      checkCharacterDrift: true,
    },
    outputTemplate: {
      sections: ["synopsis", "chapter_or_scene"],
    },
    routingKeywords: ["novel", "story", "chapter", "scene", "소설", "스토리", "시나리오"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 2,
      defaultReasoning: "medium",
    },
  },
  {
    key: "report",
    name: "Structured Report",
    inputSchema: {
      required: ["goal", "audience", "format"],
      optional: ["length", "tone", "deadline"],
    },
    promptPreset: {
      mode: "reporting",
      includeExecutiveSummary: true,
    },
    qaRules: {
      requireSections: ["summary", "body", "action_items"],
      failOnMissingSections: true,
    },
    outputTemplate: {
      sections: ["summary", "body", "action_items"],
    },
    routingKeywords: ["report", "analysis", "brief", "보고서", "분석", "정리", "리포트"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      defaultReasoning: "high",
    },
  },
  {
    key: "video_preprod",
    name: "Video Pre-production",
    inputSchema: {
      required: ["platform", "duration", "goal"],
      optional: ["target_audience", "style", "cta"],
    },
    promptPreset: {
      mode: "video_planning",
      includeShotList: true,
    },
    qaRules: {
      requireShotList: true,
      requireScript: true,
      requireRenderedVideo: true,
    },
    outputTemplate: {
      sections: ["concept", "script", "shot_list", "editing_notes", "video_file"],
    },
    routingKeywords: ["video", "shorts", "reel", "콘티", "영상", "대본", "샷리스트"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 2,
      defaultReasoning: "medium",
    },
  },
  {
    key: "web_research_report",
    name: "Web Research Report",
    inputSchema: {
      required: ["topic", "time_range"],
      optional: ["source_policy", "language", "depth"],
    },
    promptPreset: {
      mode: "web_research",
      requireCitations: true,
    },
    qaRules: {
      failWithoutCitations: true,
      citationStyle: "inline_links",
    },
    outputTemplate: {
      sections: ["summary", "findings", "citations", "recommendations"],
    },
    routingKeywords: ["research", "web search", "investigate", "조사", "웹서치", "자료조사", "리서치"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 3,
      defaultReasoning: "high",
    },
  },
  {
    key: "roleplay",
    name: "Roleplay",
    inputSchema: {
      required: ["character", "tone"],
      optional: ["setting", "constraints", "safety_rules"],
    },
    promptPreset: {
      mode: "roleplay",
      stayInCharacter: true,
    },
    qaRules: {
      keepCharacterVoice: true,
      enforceSafetyPolicy: true,
    },
    outputTemplate: {
      sections: ["dialogue"],
    },
    routingKeywords: ["roleplay", "rp", "character chat", "역할놀이", "역할극", "대화해줘"],
    costProfile: {
      ...COMMON_COST_PROFILE,
      maxRounds: 1,
      defaultReasoning: "low",
    },
  },
  {
    key: "facility_visit",
    name: "Facility Visit Prep",
    inputSchema: {
      required: ["facility", "visit_date", "purpose"],
      optional: ["prior_visit_path", "contract_ids", "technical_issues", "contacts_override"],
    },
    promptPreset: {
      mode: "analysis",
      systemPrompt:
        "You are preparing a comprehensive facility visit briefing document for a Siemens Healthineers MRI collaboration manager visiting {{facility}} on {{visit_date}}.\n\nVisit Purpose: {{purpose}}\n{{#prior_visit_path}}Prior Visit Notes: {{prior_visit_path}}{{/prior_visit_path}}\n{{#technical_issues}}Technical Issues to Address: {{technical_issues}}{{/technical_issues}}\n\nPrepare a structured briefing document with these required sections:\n1. Basic facility information and visit logistics\n2. Key contacts table (name, role, email)\n3. Pre-visit checklist (actionable items)\n4. Agenda (priority-ordered P0-P3, with time estimates)\n5. Technical context (relevant MRI protocols, WIP status, recent issues)\n6. Contract status table (contract IDs, signature chain, risk level)\n7. Follow-up action template\n\nRead available context from the project directory to populate these sections. Be specific and actionable.",
      includeProjectFiles: true,
      maxContextFiles: 10,
    },
    qaRules: {
      requiredSections: ["contacts", "checklist", "agenda", "contract", "followup"],
      failOnMissingSections: true,
      rules: [
        "All checklist items must begin with an action verb",
        "Agenda must have at least one P0 item",
        "Contract table must reference at least one contract ID",
        "Follow-up section must have at least one actionable item",
      ],
    },
    outputTemplate: {
      filename: "{{YYMMDD}}_visit_prep_{{facility}}.md",
      sections: [
        "header",
        "facility_info",
        "contacts",
        "pre_visit_checklist",
        "agenda",
        "technical_context",
        "contract_status",
        "decision_flow",
        "followup_template",
      ],
    },
    routingKeywords: [
      "visit prep",
      "訪問準備",
      "施設訪問",
      "visit briefing",
      "pre-visit",
      "出張準備",
      "facility visit",
      "訪問前確認",
    ],
    costProfile: {
      maxInputTokens: 20000,
      maxOutputTokens: 12000,
      maxRounds: 4,
      defaultReasoning: "high",
    },
  },
];

export interface FacilityVisitPackInput {
  facility: string;
  visit_date: string; // YYYY-MM-DD
  purpose: string;
  prior_visit_path?: string;
  contract_ids?: string;
  technical_issues?: string;
  contacts_override?: string;
}
