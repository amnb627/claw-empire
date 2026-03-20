import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTaskSearch } from "./useTaskSearch";
import type { TaskFilter } from "./useTaskSearch";
import type { Task } from "../types";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Test Task",
    description: overrides.description ?? null,
    department_id: overrides.department_id ?? null,
    assigned_agent_id: overrides.assigned_agent_id ?? null,
    project_id: overrides.project_id ?? null,
    status: overrides.status ?? "inbox",
    priority: overrides.priority ?? 3,
    task_type: overrides.task_type ?? "general",
    workflow_pack_key: overrides.workflow_pack_key ?? undefined,
    project_path: overrides.project_path ?? null,
    result: overrides.result ?? null,
    started_at: overrides.started_at ?? null,
    completed_at: overrides.completed_at ?? null,
    created_at: overrides.created_at ?? Date.now(),
    updated_at: overrides.updated_at ?? Date.now(),
    hidden: overrides.hidden ?? 0,
  };
}

const EMPTY_FILTER: TaskFilter = {
  query: "",
  status: [],
  packKey: [],
  projectId: [],
  priority: null,
};

const SAMPLE_TASKS: Task[] = [
  makeTask({ id: "1", title: "Fix login bug", status: "inbox" }),
  makeTask({ id: "2", title: "Write unit tests", status: "planned", description: "Cover auth module" }),
  makeTask({ id: "3", title: "Deploy to staging", status: "in_progress" }),
  makeTask({ id: "4", title: "Code review PR", status: "review", workflow_pack_key: "development" }),
  makeTask({ id: "5", title: "Update documentation", status: "done", workflow_pack_key: "report" }),
];

describe("useTaskSearch", () => {
  it("returns all tasks when filter is empty", () => {
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, EMPTY_FILTER));
    expect(result.current).toHaveLength(SAMPLE_TASKS.length);
  });

  it("filters by query string — case-insensitive title match", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, query: "login" };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("1");
  });

  it("filters by query string — case-insensitive match (uppercase query)", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, query: "TESTS" };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("2");
  });

  it("filters by query string — searches description as well", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, query: "auth module" };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("2");
  });

  it("returns empty array when query matches nothing", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, query: "nonexistent xyz" };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    expect(result.current).toHaveLength(0);
  });

  it("filters by status array — single status", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, status: ["inbox"] };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("1");
  });

  it("filters by status array — multiple statuses", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, status: ["inbox", "planned", "done"] };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    expect(result.current).toHaveLength(3);
    expect(result.current.map((t) => t.id)).toEqual(expect.arrayContaining(["1", "2", "5"]));
  });

  it("filters by packKey array", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, packKey: ["development"] };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("4");
  });

  it("filters by projectId array", () => {
    const tasksWithProjects = [
      makeTask({ id: "p1", title: "Task A", project_id: "proj-x" }),
      makeTask({ id: "p2", title: "Task B", project_id: "proj-y" }),
      makeTask({ id: "p3", title: "Task C", project_id: null }),
    ];
    const filter: TaskFilter = { ...EMPTY_FILTER, projectId: ["proj-x"] };
    const { result } = renderHook(() => useTaskSearch(tasksWithProjects, filter));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("p1");
  });

  it("filters by priority threshold", () => {
    const tasksWithPriority = [
      makeTask({ id: "p1", title: "Low priority", priority: 1 }),
      makeTask({ id: "p2", title: "Medium priority", priority: 3 }),
      makeTask({ id: "p3", title: "High priority", priority: 5 }),
    ];
    const filter: TaskFilter = { ...EMPTY_FILTER, priority: 3 };
    const { result } = renderHook(() => useTaskSearch(tasksWithPriority, filter));
    expect(result.current).toHaveLength(2);
    expect(result.current.map((t) => t.id)).toEqual(expect.arrayContaining(["p2", "p3"]));
  });

  it("combines query + status filters with AND logic", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, query: "task", status: ["planned"] };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    // "Write unit tests" has status "planned" and title contains... does not contain "task"
    // "Fix login bug" has status "inbox" — filtered out by status
    // Let's check what matches: status=planned AND query=unit
    const filter2: TaskFilter = { ...EMPTY_FILTER, query: "unit", status: ["planned"] };
    const { result: result2 } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter2));
    expect(result2.current).toHaveLength(1);
    expect(result2.current[0].id).toBe("2");
  });

  it("returns empty when multiple filters combine to exclude everything", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, query: "login", status: ["done"] };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    // "Fix login bug" matches query but has status "inbox", not "done"
    expect(result.current).toHaveLength(0);
  });

  it("whitespace-only query is treated as empty (no filtering)", () => {
    const filter: TaskFilter = { ...EMPTY_FILTER, query: "   " };
    const { result } = renderHook(() => useTaskSearch(SAMPLE_TASKS, filter));
    expect(result.current).toHaveLength(SAMPLE_TASKS.length);
  });
});
