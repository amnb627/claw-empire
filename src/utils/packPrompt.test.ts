import { describe, expect, it } from "vitest";
import { assemblePackPrompt, hasSchemaFields, normalizePackInputSchema, type PackInputSchema } from "./packPrompt";

describe("assemblePackPrompt", () => {
  const schema: PackInputSchema = {
    required: ["facility", "visit_date"],
    optional: ["notes"],
  };

  it("includes pack name as heading", () => {
    const result = assemblePackPrompt("Facility Visit", schema, {});
    expect(result).toContain("## Task: Facility Visit");
  });

  it("renders filled required fields with title-cased labels", () => {
    const result = assemblePackPrompt("Facility Visit", schema, {
      facility: "Mie University",
      visit_date: "2026-03-25",
    });
    expect(result).toContain("**Facility**: Mie University");
    expect(result).toContain("**Visit Date**: 2026-03-25");
  });

  it("shows placeholder for unfilled required fields", () => {
    const result = assemblePackPrompt("Facility Visit", schema, {});
    expect(result).toContain("**Facility**: [REQUIRED - not provided]");
    expect(result).toContain("**Visit Date**: [REQUIRED - not provided]");
  });

  it("omits optional fields when empty", () => {
    const result = assemblePackPrompt("Facility Visit", schema, {});
    expect(result).not.toContain("**Notes**:");
  });

  it("includes optional fields when provided", () => {
    const result = assemblePackPrompt("Facility Visit", schema, {
      facility: "Mie",
      visit_date: "2026-03-25",
      notes: "Bring demo laptop",
    });
    expect(result).toContain("**Notes**: Bring demo laptop");
  });

  it("appends additional notes section when notes arg is provided", () => {
    const result = assemblePackPrompt(
      "Facility Visit",
      schema,
      { facility: "Mie", visit_date: "2026-03-25" },
      "Follow-up needed",
    );
    expect(result).toContain("**Additional Notes**: Follow-up needed");
  });

  it("does not append additional notes section when notes arg is empty string", () => {
    const result = assemblePackPrompt("Facility Visit", schema, {}, "");
    expect(result).not.toContain("Additional Notes");
  });

  it("does not append additional notes section when notes arg is whitespace only", () => {
    const result = assemblePackPrompt("Facility Visit", schema, {}, "   ");
    expect(result).not.toContain("Additional Notes");
  });

  it("handles underscore_keys with title-casing", () => {
    const s: PackInputSchema = { required: ["project_name", "acceptance_criteria"], optional: [] };
    const result = assemblePackPrompt("Dev", s, {
      project_name: "MyProject",
      acceptance_criteria: "All tests green",
    });
    expect(result).toContain("**Project Name**: MyProject");
    expect(result).toContain("**Acceptance Criteria**: All tests green");
  });

  it("handles empty schema with just a heading", () => {
    const result = assemblePackPrompt("Empty Pack", { required: [], optional: [] }, {});
    expect(result.startsWith("## Task: Empty Pack")).toBe(true);
  });

  it("trims whitespace from field values", () => {
    const result = assemblePackPrompt("Pack", { required: ["goal"], optional: [] }, { goal: "  do something  " });
    expect(result).toContain("**Goal**: do something");
  });
});

describe("hasSchemaFields", () => {
  it("returns true when required fields exist", () => {
    expect(hasSchemaFields({ required: ["x"], optional: [] })).toBe(true);
  });

  it("returns true when optional fields exist", () => {
    expect(hasSchemaFields({ required: [], optional: ["y"] })).toBe(true);
  });

  it("returns false when both arrays are empty", () => {
    expect(hasSchemaFields({ required: [], optional: [] })).toBe(false);
  });

  it("returns false for null", () => {
    expect(hasSchemaFields(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasSchemaFields(undefined)).toBe(false);
  });
});

describe("normalizePackInputSchema", () => {
  it("parses a valid schema object", () => {
    const result = normalizePackInputSchema({ required: ["a", "b"], optional: ["c"] });
    expect(result).toEqual({ required: ["a", "b"], optional: ["c"] });
  });

  it("filters out non-string entries", () => {
    const result = normalizePackInputSchema({ required: ["a", 42, null], optional: [true, "c"] });
    expect(result).toEqual({ required: ["a"], optional: ["c"] });
  });

  it("returns null for null input", () => {
    expect(normalizePackInputSchema(null)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(normalizePackInputSchema("string")).toBeNull();
    expect(normalizePackInputSchema(42)).toBeNull();
  });

  it("returns null when both arrays are empty after filtering", () => {
    expect(normalizePackInputSchema({ required: [], optional: [] })).toBeNull();
  });

  it("handles missing optional key (defaults to empty array)", () => {
    const result = normalizePackInputSchema({ required: ["topic"] });
    expect(result).toEqual({ required: ["topic"], optional: [] });
  });

  it("handles missing required key (defaults to empty array)", () => {
    const result = normalizePackInputSchema({ optional: ["depth"] });
    expect(result).toEqual({ required: [], optional: ["depth"] });
  });
});
