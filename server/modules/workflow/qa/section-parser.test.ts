import { describe, expect, it } from "vitest";
import { parseMarkdownSections, checkRequiredSections } from "./section-parser.ts";

// ---------------------------------------------------------------------------
// parseMarkdownSections
// ---------------------------------------------------------------------------
describe("parseMarkdownSections", () => {
  it("identifies a ## heading as a section with normalized name", () => {
    const md = "## Contacts\n\nJohn Doe, jane@example.com\n";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.name).toBe("contacts");
    expect(sections[0]!.heading).toBe("Contacts");
  });

  it("captures content under each section", () => {
    const md = "## Summary\n\nThis is the summary.\n\n## Findings\n\nResult here.";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.name).toBe("summary");
    expect(sections[0]!.content).toContain("This is the summary.");
    expect(sections[1]!.name).toBe("findings");
    expect(sections[1]!.content).toContain("Result here.");
  });

  it("handles nested headings (h3/h4) as separate sections", () => {
    const md = "## Pre-visit Checklist\n\n### Details\n\nItem 1\n";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.name).toBe("pre_visit_checklist");
    expect(sections[1]!.name).toBe("details");
  });

  it("normalizes heading text with special characters to underscored slug", () => {
    const md = "## Contract Status (Risk)\n\nSome content\n";
    const sections = parseMarkdownSections(md);
    expect(sections[0]!.name).toBe("contract_status_risk_");
  });

  it("returns empty array for markdown with no headings", () => {
    const md = "Just some plain text without any headings.\n";
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(0);
  });

  it("records the correct lineStart for each section", () => {
    const md = "# Title\n\nParagraph.\n\n## Section A\n\nContent A\n";
    const sections = parseMarkdownSections(md);
    expect(sections[0]!.lineStart).toBe(0);
    expect(sections[1]!.lineStart).toBe(4);
  });

  it("preserves Japanese characters in section names", () => {
    const md = "## 連絡先\n\n田中さん\n";
    const sections = parseMarkdownSections(md);
    expect(sections[0]!.name).toContain("連絡先");
  });
});

// ---------------------------------------------------------------------------
// checkRequiredSections
// ---------------------------------------------------------------------------
describe("checkRequiredSections", () => {
  const sampleDoc = `
## Contacts

John Doe — lead

## Pre-visit Checklist

- [ ] Confirm visit

## Agenda

P0: Demo session

## Contract Status

ID: RC-001

## Follow-up

Send report
`.trim();

  it("returns all sections as present when all required sections exist", () => {
    const { present, missing } = checkRequiredSections(sampleDoc, [
      "contacts",
      "checklist",
      "agenda",
      "contract",
      "followup",
    ]);
    expect(missing).toHaveLength(0);
    expect(present).toHaveLength(5);
  });

  it("returns missing entry for a section that does not exist", () => {
    const { missing } = checkRequiredSections(sampleDoc, ["contacts", "budget"]);
    expect(missing).toContain("budget");
    expect(missing).not.toContain("contacts");
  });

  it('fuzzy-matches "pre_visit_checklist" against heading "Pre-visit Checklist"', () => {
    const { present } = checkRequiredSections(sampleDoc, ["pre_visit_checklist"]);
    // The normalized section name is "pre_visit_checklist"; required normalized is same
    expect(present).toContain("pre_visit_checklist");
  });

  it('fuzzy-matches short keyword "checklist" against "pre_visit_checklist" section', () => {
    // "pre_visit_checklist" includes "checklist"
    const { present } = checkRequiredSections(sampleDoc, ["checklist"]);
    expect(present).toContain("checklist");
  });

  it("returns empty present/missing arrays when required list is empty", () => {
    const { present, missing } = checkRequiredSections(sampleDoc, []);
    expect(present).toHaveLength(0);
    expect(missing).toHaveLength(0);
  });

  it("also returns the parsed sections list", () => {
    const { sections } = checkRequiredSections(sampleDoc, ["contacts"]);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.some((s) => s.name === "contacts")).toBe(true);
  });
});
