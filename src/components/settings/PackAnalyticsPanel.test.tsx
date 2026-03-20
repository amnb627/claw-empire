import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkflowPacksTab from "./WorkflowPacksTab";
import type { WorkflowPackConfig, PackAnalytics } from "../../api";

// Mock API module
const apiMocks = vi.hoisted(() => ({
  getWorkflowPacks: vi.fn(),
  updateWorkflowPack: vi.fn(),
  createWorkflowPack: vi.fn(),
  deleteWorkflowPack: vi.fn(),
  getPackAnalytics: vi.fn(),
}));

vi.mock("../../api", () => ({
  getWorkflowPacks: apiMocks.getWorkflowPacks,
  updateWorkflowPack: apiMocks.updateWorkflowPack,
  createWorkflowPack: apiMocks.createWorkflowPack,
  deleteWorkflowPack: apiMocks.deleteWorkflowPack,
  getPackAnalytics: apiMocks.getPackAnalytics,
}));

function t(messages: Record<string, string>): string {
  return messages.en ?? messages.ko ?? messages.ja ?? messages.zh ?? Object.values(messages)[0] ?? "";
}

const REPORT_PACK: WorkflowPackConfig = {
  key: "report",
  name: "Report",
  enabled: true,
  input_schema: {},
  prompt_preset: {},
  qa_rules: {},
  output_template: {},
  routing_keywords: [],
  cost_profile: {},
};

const EMPTY_ANALYTICS: PackAnalytics = {
  key: "report",
  period_days: 30,
  total: 0,
  completed: 0,
  first_pass: 0,
  first_pass_rate: null,
  avg_completion_ms: null,
  top_revision_reasons: [],
  recent_tasks: [],
};

const FULL_ANALYTICS: PackAnalytics = {
  key: "report",
  period_days: 30,
  total: 5,
  completed: 4,
  first_pass: 3,
  first_pass_rate: 75,
  avg_completion_ms: 750_000,
  top_revision_reasons: [{ normalized_note: "missing contacts section", count: 2 }],
  recent_tasks: [
    {
      id: "t1",
      title: "Visit Prep: 名古屋大学",
      status: "done",
      created_at: Date.now() - 7_200_000,
      completed_at: Date.now() - 7_000_000,
      revision_count: 0,
    },
  ],
};

describe("PackAnalyticsPanel (via WorkflowPacksTab)", () => {
  beforeEach(() => {
    apiMocks.getWorkflowPacks.mockReset();
    apiMocks.updateWorkflowPack.mockReset();
    apiMocks.createWorkflowPack.mockReset();
    apiMocks.deleteWorkflowPack.mockReset();
    apiMocks.getPackAnalytics.mockReset();

    apiMocks.getWorkflowPacks.mockResolvedValue({ packs: [REPORT_PACK] });
    apiMocks.updateWorkflowPack.mockResolvedValue({ ok: true, pack: REPORT_PACK });
    apiMocks.getPackAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
  });

  it("renders analytics panel when Stats button is clicked (empty data)", async () => {
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText("Report")).toBeInTheDocument();
    });

    const statsBtn = screen.getByRole("button", { name: /Stats Report/i });
    await user.click(statsBtn);

    await waitFor(() => {
      expect(screen.getByTestId("analytics-panel")).toBeInTheDocument();
    });

    expect(apiMocks.getPackAnalytics).toHaveBeenCalledWith("report", 30);
  });

  it("shows loading state while analytics are being fetched", async () => {
    apiMocks.getPackAnalytics.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText("Report")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Stats Report/i }));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-panel")).toBeInTheDocument();
    });

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders full analytics data including metrics, revision reasons, and recent tasks", async () => {
    apiMocks.getPackAnalytics.mockResolvedValue(FULL_ANALYTICS);
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText("Report")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Stats Report/i }));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-panel")).toBeInTheDocument();
    });

    await waitFor(() => {
      // Should show total tasks
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    // Check first-pass rate
    expect(screen.getByText("3 (75%)")).toBeInTheDocument();

    // Check top revision reason
    expect(screen.getByText("missing contacts section")).toBeInTheDocument();

    // Check recent task
    expect(screen.getByText("Visit Prep: 名古屋大学")).toBeInTheDocument();
  });

  it("shows 'No tasks in this period' message when total is 0", async () => {
    apiMocks.getPackAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText("Report")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Stats Report/i }));

    await waitFor(() => {
      expect(screen.getByText("No tasks in this period.")).toBeInTheDocument();
    });
  });

  it("refetches when period dropdown changes", async () => {
    apiMocks.getPackAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText("Report")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Stats Report/i }));

    await waitFor(() => {
      expect(screen.getByTestId("analytics-panel")).toBeInTheDocument();
    });

    // Click 7d period button
    const sevenDayBtn = screen.getByRole("button", { name: "7d" });
    await user.click(sevenDayBtn);

    await waitFor(() => {
      expect(apiMocks.getPackAnalytics).toHaveBeenCalledWith("report", 7);
    });
  });

  it("collapses analytics panel when Stats button is clicked again", async () => {
    apiMocks.getPackAnalytics.mockResolvedValue(EMPTY_ANALYTICS);
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText("Report")).toBeInTheDocument();
    });

    const statsBtn = screen.getByRole("button", { name: /Stats Report/i });

    // Open
    await user.click(statsBtn);
    await waitFor(() => {
      expect(screen.getByTestId("analytics-panel")).toBeInTheDocument();
    });

    // Close
    await user.click(statsBtn);
    await waitFor(() => {
      expect(screen.queryByTestId("analytics-panel")).not.toBeInTheDocument();
    });
  });
});
