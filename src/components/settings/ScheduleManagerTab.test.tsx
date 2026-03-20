import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScheduleManagerTab from "./ScheduleManagerTab";
import type { TaskSchedule } from "../../api";

const apiMocks = vi.hoisted(() => ({
  getSchedules: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  triggerSchedule: vi.fn(),
}));

vi.mock("../../api", () => ({
  getSchedules: apiMocks.getSchedules,
  createSchedule: apiMocks.createSchedule,
  updateSchedule: apiMocks.updateSchedule,
  deleteSchedule: apiMocks.deleteSchedule,
  triggerSchedule: apiMocks.triggerSchedule,
}));

function t(messages: Record<string, string>): string {
  return messages.en ?? messages.ko ?? messages.ja ?? messages.zh ?? Object.values(messages)[0] ?? "";
}

const SAMPLE_SCHEDULE: TaskSchedule = {
  id: "sched-1",
  title_template: "Weekly ZK Audit {{date}}",
  description_template: "Run audit on {{date}}",
  workflow_pack_key: "report",
  project_id: null,
  assigned_agent_id: null,
  workflow_meta_json: null,
  priority: 0,
  interval_days: 7,
  next_trigger_at: Date.now() + 86_400_000,
  last_triggered_at: null,
  enabled: true,
  created_at: Date.now() - 86_400_000,
  updated_at: Date.now() - 86_400_000,
};

describe("ScheduleManagerTab", () => {
  beforeEach(() => {
    apiMocks.getSchedules.mockReset();
    apiMocks.createSchedule.mockReset();
    apiMocks.updateSchedule.mockReset();
    apiMocks.deleteSchedule.mockReset();
    apiMocks.triggerSchedule.mockReset();

    apiMocks.getSchedules.mockResolvedValue([SAMPLE_SCHEDULE]);
    apiMocks.createSchedule.mockResolvedValue({ ok: true, schedule: SAMPLE_SCHEDULE });
    apiMocks.updateSchedule.mockResolvedValue({ ok: true, schedule: SAMPLE_SCHEDULE });
    apiMocks.deleteSchedule.mockResolvedValue({ ok: true, id: "sched-1" });
    apiMocks.triggerSchedule.mockResolvedValue({ ok: true });
  });

  it("renders the schedule list", async () => {
    render(<ScheduleManagerTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Weekly ZK Audit {{date}}")).toBeInTheDocument();
    });
    expect(screen.getByText("report")).toBeInTheDocument();
  });

  it("shows empty state when no schedules", async () => {
    apiMocks.getSchedules.mockResolvedValue([]);
    render(<ScheduleManagerTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("No schedules found.")).toBeInTheDocument();
    });
  });

  it("opens the new schedule form when New Schedule is clicked", async () => {
    const user = userEvent.setup();
    render(<ScheduleManagerTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Weekly ZK Audit {{date}}")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /New Schedule/i }));
    expect(screen.getByText("New Schedule")).toBeInTheDocument();
  });

  it("Save button is disabled when title_template is empty", async () => {
    const user = userEvent.setup();
    render(<ScheduleManagerTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Weekly ZK Audit {{date}}")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /New Schedule/i }));

    const saveBtn = screen.getByRole("button", { name: /^Save$/i });
    expect(saveBtn).toBeDisabled();
    expect(apiMocks.createSchedule).not.toHaveBeenCalled();
  });

  it("validates interval_days must be > 0", async () => {
    const user = userEvent.setup();
    render(<ScheduleManagerTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Weekly ZK Audit {{date}}")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /New Schedule/i }));

    // Fill title
    const titleInput = screen.getByPlaceholderText(/ZK Audit/i);
    await user.type(titleInput, "My Schedule");

    // Clear and set interval to 0
    const intervalInput = screen.getByRole("spinbutton");
    await user.clear(intervalInput);
    await user.type(intervalInput, "0");

    const saveBtn = screen.getByRole("button", { name: /^Save$/i });
    expect(saveBtn).toBeDisabled();
  });

  it("submits create form and adds schedule to list", async () => {
    const user = userEvent.setup();
    const newSchedule: TaskSchedule = { ...SAMPLE_SCHEDULE, id: "new-1", title_template: "Daily Report" };
    apiMocks.createSchedule.mockResolvedValue({ ok: true, schedule: newSchedule });
    apiMocks.getSchedules.mockResolvedValue([]);

    render(<ScheduleManagerTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("No schedules found.")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /New Schedule/i }));

    const titleInput = screen.getByPlaceholderText(/ZK Audit/i);
    await user.type(titleInput, "Daily Report");

    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(apiMocks.createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ title_template: "Daily Report" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Daily Report")).toBeInTheDocument();
    });
  });

  it("deletes a schedule after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<ScheduleManagerTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText("Weekly ZK Audit {{date}}")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: /Delete Weekly ZK Audit/i });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(apiMocks.deleteSchedule).toHaveBeenCalledWith("sched-1");
    });

    await waitFor(() => {
      expect(screen.queryByText("Weekly ZK Audit {{date}}")).not.toBeInTheDocument();
    });
  });

  it("does not delete when confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<ScheduleManagerTab t={t} />);

    await waitFor(() => {
      expect(screen.getByText("Weekly ZK Audit {{date}}")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Delete Weekly ZK Audit/i }));

    expect(apiMocks.deleteSchedule).not.toHaveBeenCalled();
    expect(screen.getByText("Weekly ZK Audit {{date}}")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    apiMocks.getSchedules.mockReturnValue(new Promise(() => {}));
    render(<ScheduleManagerTab t={t} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows error state with retry button when load fails", async () => {
    apiMocks.getSchedules.mockRejectedValue(new Error("Server error"));
    render(<ScheduleManagerTab t={t} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
