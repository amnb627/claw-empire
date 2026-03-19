import { describe, expect, it } from "vitest";
import {
  parseBoundedInt,
  truncateField,
  validateTaskCreateBody,
} from "./validation.ts";

const normalize = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
};

describe("parseBoundedInt", () => {
  it("returns fallback for null/undefined", () => {
    expect(parseBoundedInt(null, 5, 0, 100)).toBe(5);
    expect(parseBoundedInt(undefined, 5, 0, 100)).toBe(5);
  });

  it("parses valid numbers", () => {
    expect(parseBoundedInt(42, 0, 0, 100)).toBe(42);
    expect(parseBoundedInt("42", 0, 0, 100)).toBe(42);
  });

  it("clamps to min/max bounds", () => {
    expect(parseBoundedInt(-999, 0, -100, 100)).toBe(-100);
    expect(parseBoundedInt(999, 0, -100, 100)).toBe(100);
  });

  it("truncates decimals", () => {
    expect(parseBoundedInt(3.7, 0, 0, 100)).toBe(3);
    expect(parseBoundedInt(-2.3, 0, -10, 10)).toBe(-2);
  });

  it("returns fallback for NaN", () => {
    expect(parseBoundedInt("abc", 5, 0, 100)).toBe(5);
    expect(parseBoundedInt(NaN, 5, 0, 100)).toBe(5);
    expect(parseBoundedInt(Infinity, 5, 0, 100)).toBe(5);
  });
});

describe("truncateField", () => {
  it("returns null for null/undefined", () => {
    expect(truncateField(null, 100)).toBeNull();
    expect(truncateField(undefined, 100)).toBeNull();
  });

  it("returns null for empty/whitespace strings", () => {
    expect(truncateField("", 100)).toBeNull();
    expect(truncateField("   ", 100)).toBeNull();
  });

  it("returns trimmed string within limit", () => {
    expect(truncateField("  hello  ", 100)).toBe("hello");
  });

  it("truncates strings exceeding limit", () => {
    expect(truncateField("abcdefgh", 5)).toBe("abcde");
  });

  it("returns null for non-string values", () => {
    expect(truncateField(123, 100)).toBeNull();
    expect(truncateField({}, 100)).toBeNull();
  });
});

describe("validateTaskCreateBody", () => {
  it("rejects null/non-object body", () => {
    expect(validateTaskCreateBody(null, normalize).ok).toBe(false);
    expect(validateTaskCreateBody("string", normalize).ok).toBe(false);
  });

  it("requires title", () => {
    const result = validateTaskCreateBody({}, normalize);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("title_required");
  });

  it("rejects empty title", () => {
    const result = validateTaskCreateBody({ title: "  " }, normalize);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("title_required");
  });

  it("accepts valid minimal input", () => {
    const result = validateTaskCreateBody({ title: "Test task" }, normalize);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe("Test task");
      expect(result.data.status).toBe("inbox");
      expect(result.data.priority).toBe(0);
      expect(result.data.task_type).toBe("general");
    }
  });

  it("validates status enum", () => {
    const valid = validateTaskCreateBody(
      { title: "t", status: "review" },
      normalize,
    );
    expect(valid.ok).toBe(true);

    const invalid = validateTaskCreateBody(
      { title: "t", status: "unknown_status" },
      normalize,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toBe("invalid_status");
  });

  it("validates task_type enum", () => {
    const valid = validateTaskCreateBody(
      { title: "t", task_type: "development" },
      normalize,
    );
    expect(valid.ok).toBe(true);

    const invalid = validateTaskCreateBody(
      { title: "t", task_type: "hacking" },
      normalize,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toBe("invalid_task_type");
  });

  it("clamps priority to safe range", () => {
    const result = validateTaskCreateBody(
      { title: "t", priority: 9999 },
      normalize,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.priority).toBe(1000);
  });

  it("coerces workflow_meta_json from object to string", () => {
    const result = validateTaskCreateBody(
      { title: "t", workflow_meta_json: { key: "value" } },
      normalize,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.workflow_meta_json).toBe('{"key":"value"}');
  });

  it("handles all optional fields", () => {
    const result = validateTaskCreateBody(
      {
        title: "Full task",
        description: "Some description",
        department_id: "dev",
        assigned_agent_id: "agent-1",
        project_id: "proj-1",
        project_path: "/some/path",
        status: "planned",
        priority: 5,
        task_type: "analysis",
        output_format: "markdown",
        base_branch: "main",
      },
      normalize,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.description).toBe("Some description");
      expect(result.data.department_id).toBe("dev");
      expect(result.data.status).toBe("planned");
      expect(result.data.task_type).toBe("analysis");
    }
  });
});
