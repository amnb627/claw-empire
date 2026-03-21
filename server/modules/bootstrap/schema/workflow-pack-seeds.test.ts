import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { seedDefaultWorkflowPacks } from "./workflow-pack-seeds.ts";
import { DEFAULT_WORKFLOW_PACK_SEEDS } from "../../workflow/packs/definitions.ts";

function createPacksDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE workflow_packs (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      input_schema_json TEXT NOT NULL DEFAULT '{}',
      prompt_preset_json TEXT NOT NULL DEFAULT '{}',
      qa_rules_json TEXT NOT NULL DEFAULT '{}',
      output_template_json TEXT NOT NULL DEFAULT '{}',
      routing_keywords_json TEXT NOT NULL DEFAULT '[]',
      cost_profile_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

describe("workflow-pack-seeds: facility_visit", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createPacksDb();
    seedDefaultWorkflowPacks(db);
  });

  afterEach(() => {
    db.close();
  });

  it("facility_visit pack이 시드 데이터에 존재한다", () => {
    const row = db.prepare("SELECT key, name, enabled FROM workflow_packs WHERE key = ?").get("facility_visit") as
      | { key: string; name: string; enabled: number }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.key).toBe("facility_visit");
    expect(row?.name).toBe("Facility Visit Prep");
    expect(row?.enabled).toBe(1);
  });

  it("facility_visit routing keywords에 '訪問準備'가 포함되어 있다", () => {
    const row = db.prepare("SELECT routing_keywords_json FROM workflow_packs WHERE key = ?").get("facility_visit") as
      | { routing_keywords_json: string }
      | undefined;
    expect(row).toBeDefined();
    const keywords = JSON.parse(row!.routing_keywords_json) as string[];
    expect(keywords).toContain("訪問準備");
    expect(keywords).toContain("facility visit");
    expect(keywords).toContain("visit prep");
  });

  it("facility_visit cost_profile에 올바른 토큰 한도가 설정되어 있다", () => {
    const row = db.prepare("SELECT cost_profile_json FROM workflow_packs WHERE key = ?").get("facility_visit") as
      | { cost_profile_json: string }
      | undefined;
    expect(row).toBeDefined();
    const costProfile = JSON.parse(row!.cost_profile_json) as Record<string, unknown>;
    expect(costProfile.maxInputTokens).toBe(20000);
    expect(costProfile.maxOutputTokens).toBe(12000);
    expect(costProfile.maxRounds).toBe(4);
    expect(costProfile.defaultReasoning).toBe("high");
  });

  it("facility_visit qa_rules에 필수 섹션 목록이 정의되어 있다", () => {
    const row = db.prepare("SELECT qa_rules_json FROM workflow_packs WHERE key = ?").get("facility_visit") as
      | { qa_rules_json: string }
      | undefined;
    expect(row).toBeDefined();
    const qaRules = JSON.parse(row!.qa_rules_json) as Record<string, unknown>;
    expect(qaRules.failOnMissingSections).toBe(true);
    const sections = qaRules.requiredSections as string[];
    expect(sections).toContain("contacts");
    expect(sections).toContain("checklist");
    expect(sections).toContain("agenda");
    expect(sections).toContain("contract");
    expect(sections).toContain("followup");
  });

  it("DEFAULT_WORKFLOW_PACK_SEEDS에 facility_visit 정의가 포함되어 있다", () => {
    const seed = DEFAULT_WORKFLOW_PACK_SEEDS.find((s) => s.key === "facility_visit");
    expect(seed).toBeDefined();
    expect(seed?.name).toBe("Facility Visit Prep");
    expect(Array.isArray(seed?.routingKeywords)).toBe(true);
    expect(seed?.routingKeywords).toContain("訪問準備");
  });
});
