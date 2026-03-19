import { describe, expect, it } from "vitest";
import { calculateXp, countAgentStreak, type XpContext } from "./xp-calculator.ts";

function ctx(overrides: Partial<XpContext> = {}): XpContext {
  return {
    priority: 0,
    taskType: "general",
    sourceTaskId: null,
    subtaskCount: 0,
    agentRole: "junior",
    streakCount: 0,
    ...overrides,
  };
}

describe("calculateXp", () => {
  it("returns base 10 XP for a simple general task", () => {
    const result = calculateXp(ctx());
    expect(result.base).toBe(10);
    expect(result.total).toBe(10);
  });

  it("adds complexity bonus based on priority (capped at 20)", () => {
    expect(calculateXp(ctx({ priority: 3 })).complexity).toBe(6);
    expect(calculateXp(ctx({ priority: 10 })).complexity).toBe(20);
    expect(calculateXp(ctx({ priority: 15 })).complexity).toBe(20); // capped
  });

  it("adds type bonus for development tasks", () => {
    expect(calculateXp(ctx({ taskType: "development" })).type).toBe(5);
  });

  it("adds type bonus for analysis tasks", () => {
    expect(calculateXp(ctx({ taskType: "analysis" })).type).toBe(5);
  });

  it("adds type bonus for design tasks", () => {
    expect(calculateXp(ctx({ taskType: "design" })).type).toBe(3);
  });

  it("adds type bonus for presentation tasks", () => {
    expect(calculateXp(ctx({ taskType: "presentation" })).type).toBe(2);
  });

  it("adds type bonus for documentation tasks", () => {
    expect(calculateXp(ctx({ taskType: "documentation" })).type).toBe(1);
  });

  it("gives 0 type bonus for unknown task types", () => {
    expect(calculateXp(ctx({ taskType: "unknown_type" })).type).toBe(0);
    expect(calculateXp(ctx({ taskType: null })).type).toBe(0);
  });

  it("adds collaboration bonus for child tasks", () => {
    expect(calculateXp(ctx({ sourceTaskId: "parent-123" })).collaboration).toBe(5);
    expect(calculateXp(ctx({ sourceTaskId: null })).collaboration).toBe(0);
  });

  it("adds subtask bonus (2 per subtask, capped at 10)", () => {
    expect(calculateXp(ctx({ subtaskCount: 1 })).subtask).toBe(2);
    expect(calculateXp(ctx({ subtaskCount: 3 })).subtask).toBe(6);
    expect(calculateXp(ctx({ subtaskCount: 5 })).subtask).toBe(10);
    expect(calculateXp(ctx({ subtaskCount: 10 })).subtask).toBe(10); // capped
  });

  it("adds streak bonus at 3 consecutive successes", () => {
    expect(calculateXp(ctx({ streakCount: 2 })).streak).toBe(0);
    expect(calculateXp(ctx({ streakCount: 3 })).streak).toBe(5);
    expect(calculateXp(ctx({ streakCount: 4 })).streak).toBe(5);
  });

  it("adds higher streak bonus at 5 consecutive successes", () => {
    expect(calculateXp(ctx({ streakCount: 5 })).streak).toBe(10);
    expect(calculateXp(ctx({ streakCount: 10 })).streak).toBe(10);
  });

  it("handles negative priority gracefully", () => {
    expect(calculateXp(ctx({ priority: -5 })).complexity).toBe(0);
  });

  it("handles negative subtaskCount gracefully", () => {
    expect(calculateXp(ctx({ subtaskCount: -3 })).subtask).toBe(0);
  });

  it("calculates maximum possible XP correctly", () => {
    const maxCtx = ctx({
      priority: 10,
      taskType: "development",
      sourceTaskId: "parent-1",
      subtaskCount: 5,
      streakCount: 5,
    });
    const result = calculateXp(maxCtx);
    // 10 + 20 + 5 + 5 + 10 + 10 = 60
    expect(result.total).toBe(60);
  });

  it("returns correct breakdown structure", () => {
    const result = calculateXp(
      ctx({
        priority: 2,
        taskType: "design",
        sourceTaskId: "p-1",
        subtaskCount: 2,
        streakCount: 3,
      }),
    );
    expect(result).toEqual({
      base: 10,
      complexity: 4,
      type: 3,
      collaboration: 5,
      subtask: 4,
      streak: 5,
      total: 31,
    });
  });
});

describe("countAgentStreak", () => {
  it("counts consecutive done/review from most recent", () => {
    const mockDb = {
      prepare: () => ({
        all: () => [
          { status: "done" },
          { status: "review" },
          { status: "done" },
          { status: "inbox" },
          { status: "done" },
        ],
      }),
    };
    expect(countAgentStreak(mockDb, "agent-1")).toBe(3);
  });

  it("returns 0 when most recent is not done/review", () => {
    const mockDb = {
      prepare: () => ({
        all: () => [{ status: "cancelled" }, { status: "done" }],
      }),
    };
    expect(countAgentStreak(mockDb, "agent-1")).toBe(0);
  });

  it("returns 0 when no tasks exist", () => {
    const mockDb = {
      prepare: () => ({
        all: () => [],
      }),
    };
    expect(countAgentStreak(mockDb, "agent-1")).toBe(0);
  });
});
