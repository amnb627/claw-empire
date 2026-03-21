import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import TaskSearchBar from "./TaskSearchBar";
import type { TaskFilter } from "../../hooks/useTaskSearch";

const EMPTY_FILTER: TaskFilter = {
  query: "",
  status: [],
  packKey: [],
  projectId: [],
  priority: null,
};

function renderBar(props?: {
  filter?: TaskFilter;
  totalCount?: number;
  filteredCount?: number;
  onFilterChange?: (f: TaskFilter) => void;
}) {
  const { filter = EMPTY_FILTER, totalCount = 47, filteredCount = 47, onFilterChange = vi.fn() } = props ?? {};
  return render(
    <I18nProvider language="en">
      <TaskSearchBar
        filter={filter}
        totalCount={totalCount}
        filteredCount={filteredCount}
        onFilterChange={onFilterChange}
      />
    </I18nProvider>,
  );
}

describe("TaskSearchBar", () => {
  it("renders with the correct placeholder text", () => {
    renderBar();
    expect(screen.getByPlaceholderText(/search tasks.*/i)).toBeInTheDocument();
  });

  it("shows the search input with current query value", () => {
    renderBar({ filter: { ...EMPTY_FILTER, query: "my query" } });
    const input = screen.getByDisplayValue("my query");
    expect(input).toBeInTheDocument();
  });

  it("calls onFilterChange when user types in the input", () => {
    const onFilterChange = vi.fn();
    renderBar({ onFilterChange });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ query: "hello" }));
  });

  it("shows clear button when query is non-empty", () => {
    renderBar({ filter: { ...EMPTY_FILTER, query: "test" } });
    expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
  });

  it("does NOT show clear button when query is empty", () => {
    renderBar({ filter: EMPTY_FILTER });
    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();
  });

  it("clicking clear button resets query", () => {
    const onFilterChange = vi.fn();
    renderBar({ filter: { ...EMPTY_FILTER, query: "test" }, onFilterChange });
    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ query: "" }));
  });

  it("renders all status filter pills", () => {
    renderBar();
    expect(screen.getByRole("button", { name: "inbox" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "planned" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "in progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cancelled" })).toBeInTheDocument();
  });

  it("clicking a status pill adds it to filter.status", () => {
    const onFilterChange = vi.fn();
    renderBar({ onFilterChange });
    fireEvent.click(screen.getByRole("button", { name: "inbox" }));
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: expect.arrayContaining(["inbox"]) }));
  });

  it("clicking an active status pill removes it from filter.status", () => {
    const onFilterChange = vi.fn();
    renderBar({
      filter: { ...EMPTY_FILTER, status: ["inbox"] },
      onFilterChange,
    });
    fireEvent.click(screen.getByRole("button", { name: "inbox" }));
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: [] }));
  });

  it("shows result count when filtered < total", () => {
    renderBar({ totalCount: 47, filteredCount: 12 });
    expect(screen.getByText(/showing 12 of 47 tasks/i)).toBeInTheDocument();
  });

  it("does NOT show result count when filtered == total", () => {
    renderBar({ totalCount: 47, filteredCount: 47 });
    expect(screen.queryByText(/showing/i)).not.toBeInTheDocument();
  });

  it("shows filter badge when active filters are present", () => {
    renderBar({ filter: { ...EMPTY_FILTER, status: ["inbox", "done"] } });
    // Should show a badge with count (status counts as 1 filter group)
    expect(screen.getByText(/filter/i)).toBeInTheDocument();
  });

  it("clicking the filter clear badge calls onFilterChange with empty filter", () => {
    const onFilterChange = vi.fn();
    renderBar({
      filter: { ...EMPTY_FILTER, query: "hello" },
      onFilterChange,
    });
    // The "1 filter ✕" button
    const clearBtn = screen.getByText(/1 filter/i).closest("button");
    if (clearBtn) fireEvent.click(clearBtn);
    expect(onFilterChange).toHaveBeenCalledWith({
      query: "",
      status: [],
      packKey: [],
      projectId: [],
      priority: null,
    });
  });
});
