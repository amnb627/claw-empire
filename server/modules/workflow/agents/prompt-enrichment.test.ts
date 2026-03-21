import { describe, expect, it } from "vitest";
import { writeFileSync, mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrichPrompt, findFacilityZkNote, type PromptEnrichmentOptions } from "./prompt-enrichment.ts";

/** Minimal DatabaseSync stub — no tables exist by default. */
function makeStubDb(rows: Array<{ insight: string }> = [], hasMemoryTable = false): PromptEnrichmentOptions["db"] {
  return {
    prepare: (sql: string) => ({
      get: () => {
        if (sql.includes("sqlite_master") && sql.includes("agent_project_memory")) {
          return hasMemoryTable ? { name: "agent_project_memory" } : undefined;
        }
        return undefined;
      },
      all: () => rows,
      run: () => undefined,
    }),
  } as unknown as PromptEnrichmentOptions["db"];
}

function makeOpts(overrides: Partial<PromptEnrichmentOptions> = {}): PromptEnrichmentOptions {
  return {
    taskId: "test-task-1",
    projectId: null,
    workflowMetaJson: null,
    projectPath: null,
    db: makeStubDb(),
    ...overrides,
  };
}

describe("enrichPrompt — empty input", () => {
  it("returns empty contextBlock when no files, no facility, no memory", async () => {
    const result = await enrichPrompt(makeOpts());
    expect(result.contextBlock).toBe("");
    expect(result.injectedFiles).toEqual([]);
    expect(result.injectedSkills).toEqual([]);
  });

  it("returns empty contextBlock when workflow_meta_json is null", async () => {
    const result = await enrichPrompt(makeOpts({ workflowMetaJson: null }));
    expect(result.contextBlock).toBe("");
  });

  it("returns empty contextBlock when workflow_meta_json is empty object", async () => {
    const result = await enrichPrompt(makeOpts({ workflowMetaJson: "{}" }));
    expect(result.contextBlock).toBe("");
  });

  it("does not throw on invalid JSON in workflow_meta_json", async () => {
    const result = await enrichPrompt(makeOpts({ workflowMetaJson: "not-valid-json" }));
    expect(result.contextBlock).toBe("");
  });
});

describe("enrichPrompt — context files", () => {
  it("reads a real temp file and includes its content", async () => {
    const dir = mkdtempSync(join(tmpdir(), "enrichment-test-"));
    const filePath = join(dir, "test-context.md");
    writeFileSync(filePath, "# Test Content\nHello from context file.", "utf-8");

    const result = await enrichPrompt(makeOpts({ workflowMetaJson: JSON.stringify({ context_files: [filePath] }) }));

    expect(result.contextBlock).toContain("## Context Files");
    expect(result.contextBlock).toContain(filePath);
    expect(result.contextBlock).toContain("Hello from context file.");
    expect(result.injectedFiles).toContain(filePath);

    unlinkSync(filePath);
  });

  it("truncates files longer than 8000 chars", async () => {
    const dir = mkdtempSync(join(tmpdir(), "enrichment-test-"));
    const filePath = join(dir, "big-file.md");
    const bigContent = "x".repeat(9000);
    writeFileSync(filePath, bigContent, "utf-8");

    const result = await enrichPrompt(makeOpts({ workflowMetaJson: JSON.stringify({ context_files: [filePath] }) }));

    expect(result.contextBlock).toContain("[truncated]");
    expect(result.injectedFiles).toContain(filePath);

    unlinkSync(filePath);
  });

  it("handles non-existent files gracefully without throwing", async () => {
    const nonExistent = "/tmp/this-file-does-not-exist-12345678.md";
    const result = await enrichPrompt(makeOpts({ workflowMetaJson: JSON.stringify({ context_files: [nonExistent] }) }));
    // Should not throw; file-not-found comment is included
    expect(result.contextBlock).toContain("File not found");
    expect(result.injectedFiles).not.toContain(nonExistent);
  });

  it("limits to 10 files maximum", async () => {
    const dir = mkdtempSync(join(tmpdir(), "enrichment-test-"));
    const paths: string[] = [];
    for (let i = 0; i < 12; i++) {
      const p = join(dir, `file-${i}.md`);
      writeFileSync(p, `content-${i}`, "utf-8");
      paths.push(p);
    }

    const result = await enrichPrompt(makeOpts({ workflowMetaJson: JSON.stringify({ context_files: paths }) }));

    // Only first 10 should be injected
    expect(result.injectedFiles.length).toBeLessThanOrEqual(10);

    for (const p of paths) {
      try {
        unlinkSync(p);
      } catch {
        /* ok */
      }
    }
  });

  it("skips non-string entries in context_files", async () => {
    const result = await enrichPrompt(
      makeOpts({ workflowMetaJson: JSON.stringify({ context_files: [42, null, true] }) }),
    );
    expect(result.contextBlock).toBe("");
    expect(result.injectedFiles).toEqual([]);
  });
});

describe("enrichPrompt — facility ZK injection", () => {
  it("does not inject facility block when no facility in meta", async () => {
    const result = await enrichPrompt(makeOpts({ workflowMetaJson: "{}" }));
    expect(result.contextBlock).not.toContain("Facility Knowledge Base");
  });

  it("does not inject facility block for unknown facility name", async () => {
    const result = await enrichPrompt(
      makeOpts({ workflowMetaJson: JSON.stringify({ facility: "UnknownFacility_XYZ" }) }),
    );
    // ZK note for this facility won't exist on the test system
    expect(result.injectedFiles.filter((f) => f.startsWith("[ZK:"))).toHaveLength(0);
  });
});

describe("enrichPrompt — project memory", () => {
  it("skips memory section when agent_project_memory table does not exist", async () => {
    const result = await enrichPrompt(makeOpts({ projectId: "proj-1", db: makeStubDb([], false) }));
    expect(result.contextBlock).not.toContain("Project Memory");
    expect(result.injectedSkills).toEqual([]);
  });

  it("injects memory bullets when table exists and projectId is set", async () => {
    const memories = [{ insight: "Always run tests before committing" }, { insight: "Use TypeScript strict mode" }];
    const result = await enrichPrompt(
      makeOpts({
        projectId: "proj-1",
        db: makeStubDb(memories, true),
      }),
    );
    expect(result.contextBlock).toContain("Project Memory (learned patterns)");
    expect(result.contextBlock).toContain("Always run tests before committing");
    expect(result.contextBlock).toContain("Use TypeScript strict mode");
    expect(result.injectedSkills.length).toBe(2);
  });

  it("does not inject memory when projectId is null even if table exists", async () => {
    const memories = [{ insight: "Some insight" }];
    const result = await enrichPrompt(makeOpts({ projectId: null, db: makeStubDb(memories, true) }));
    expect(result.contextBlock).not.toContain("Project Memory");
  });
});

describe("enrichPrompt — combined sections", () => {
  it("wraps all sections in injected-context markers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "enrichment-test-"));
    const filePath = join(dir, "context.md");
    writeFileSync(filePath, "context content", "utf-8");

    const result = await enrichPrompt(makeOpts({ workflowMetaJson: JSON.stringify({ context_files: [filePath] }) }));

    expect(result.contextBlock).toContain("<!-- === Injected Context === -->");
    expect(result.contextBlock).toContain("<!-- === End Context === -->");

    unlinkSync(filePath);
  });

  it("ends with double newline so it separates cleanly from main prompt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "enrichment-test-"));
    const filePath = join(dir, "f.md");
    writeFileSync(filePath, "x", "utf-8");

    const result = await enrichPrompt(makeOpts({ workflowMetaJson: JSON.stringify({ context_files: [filePath] }) }));

    expect(result.contextBlock.endsWith("\n\n")).toBe(true);
    unlinkSync(filePath);
  });
});

describe("findFacilityZkNote", () => {
  it("returns null for unknown facility", () => {
    const result = findFacilityZkNote("UnknownFacilityXYZ", null);
    expect(result).toBeNull();
  });

  it("returns null for empty string facility", () => {
    const result = findFacilityZkNote("", null);
    expect(result).toBeNull();
  });
});
