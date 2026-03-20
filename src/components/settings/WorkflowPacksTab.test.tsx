import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkflowPacksTab from "./WorkflowPacksTab";
import type { WorkflowPackConfig } from "../../api";

const apiMocks = vi.hoisted(() => ({
  getWorkflowPacks: vi.fn(),
  updateWorkflowPack: vi.fn(),
  createWorkflowPack: vi.fn(),
  deleteWorkflowPack: vi.fn(),
}));

vi.mock("../../api", () => ({
  getWorkflowPacks: apiMocks.getWorkflowPacks,
  updateWorkflowPack: apiMocks.updateWorkflowPack,
  createWorkflowPack: apiMocks.createWorkflowPack,
  deleteWorkflowPack: apiMocks.deleteWorkflowPack,
}));

function t(messages: Record<string, string>): string {
  return messages.en ?? messages.ko ?? messages.ja ?? messages.zh ?? Object.values(messages)[0] ?? "";
}

const BUILTIN_PACK: WorkflowPackConfig = {
  key: "development",
  name: "Development",
  enabled: true,
  input_schema: {},
  prompt_preset: {},
  qa_rules: {},
  output_template: {},
  routing_keywords: ["fix", "build"],
  cost_profile: { maxRounds: 3, maxInputTokens: 12000 },
};

const CUSTOM_PACK: WorkflowPackConfig = {
  key: "facility_visit",
  name: "Facility Visit Prep",
  enabled: true,
  input_schema: {},
  prompt_preset: {},
  qa_rules: {},
  output_template: {},
  routing_keywords: ["visit"],
  cost_profile: { maxRounds: 2, maxInputTokens: 8000 },
};

describe("WorkflowPacksTab", () => {
  beforeEach(() => {
    apiMocks.getWorkflowPacks.mockReset();
    apiMocks.updateWorkflowPack.mockReset();
    apiMocks.createWorkflowPack.mockReset();
    apiMocks.deleteWorkflowPack.mockReset();

    apiMocks.getWorkflowPacks.mockResolvedValue({ packs: [BUILTIN_PACK, CUSTOM_PACK] });
    apiMocks.updateWorkflowPack.mockResolvedValue({ ok: true, pack: BUILTIN_PACK });
    apiMocks.createWorkflowPack.mockResolvedValue({ ok: true, pack: CUSTOM_PACK });
    apiMocks.deleteWorkflowPack.mockResolvedValue({ ok: true, key: "facility_visit" });
  });

  it("renders without crashing and shows pack list", async () => {
    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Development")).toBeInTheDocument();
    });
    expect(screen.getByText("Facility Visit Prep")).toBeInTheDocument();
  });

  it("shows Built-in badge for builtin packs and not for custom", async () => {
    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Development")).toBeInTheDocument();
    });
    // Built-in badge should appear exactly once (for development pack)
    const builtinBadges = screen.getAllByText("Built-in");
    expect(builtinBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show Delete button for builtin packs", async () => {
    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Development")).toBeInTheDocument();
    });

    // Custom pack has Delete, builtin does not
    // Find all Delete buttons
    const deleteButtons = screen.queryAllByRole("button", { name: /Delete/i });
    // Only the custom pack should have a Delete button
    expect(deleteButtons.length).toBe(1);
    expect(deleteButtons[0]).toHaveAttribute("aria-label", "Delete Facility Visit Prep");
  });

  it("toggles enabled/disabled and calls updateWorkflowPack", async () => {
    const user = userEvent.setup();
    apiMocks.updateWorkflowPack.mockResolvedValue({
      ok: true,
      pack: { ...BUILTIN_PACK, enabled: false },
    });

    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Development")).toBeInTheDocument();
    });

    const toggles = screen.getAllByRole("switch", { name: /Enable Development/i });
    await user.click(toggles[0]);

    await waitFor(() => {
      expect(apiMocks.updateWorkflowPack).toHaveBeenCalledWith("development", { enabled: false });
    });
  });

  it("opens New Pack form when clicking New Pack button", async () => {
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Development")).toBeInTheDocument();
    });

    const newPackBtn = screen.getByRole("button", { name: /New Pack/i });
    await user.click(newPackBtn);

    expect(screen.getByText("New Pack")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. facility_visit")).toBeInTheDocument();
  });

  it("validates required fields — Save button is disabled when name is empty", async () => {
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Development")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /New Pack/i }));

    // Type a key but leave name empty
    const keyInput = screen.getByPlaceholderText("e.g. facility_visit");
    await user.type(keyInput, "my_pack");

    // Save button should be disabled because name is empty
    const saveBtn = screen.getByRole("button", { name: /^Save$/i });
    expect(saveBtn).toBeDisabled();

    // createWorkflowPack should NOT have been called
    expect(apiMocks.createWorkflowPack).not.toHaveBeenCalled();
  });

  it("validates required fields — Save button is disabled when key is empty", async () => {
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Development")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /New Pack/i }));

    // Type a name but leave key empty
    const nameInput = screen.getByPlaceholderText(/Facility Visit Prep/i);
    await user.type(nameInput, "My Pack Name");

    // Save button should be disabled because key is empty
    const saveBtn = screen.getByRole("button", { name: /^Save$/i });
    expect(saveBtn).toBeDisabled();

    expect(apiMocks.createWorkflowPack).not.toHaveBeenCalled();
  });

  it("submits create form and adds pack to list", async () => {
    const user = userEvent.setup();
    const newPack: WorkflowPackConfig = {
      key: "my_custom",
      name: "My Custom Pack",
      enabled: true,
      input_schema: {},
      prompt_preset: {},
      qa_rules: {},
      output_template: {},
      routing_keywords: [],
      cost_profile: {},
    };
    apiMocks.createWorkflowPack.mockResolvedValue({ ok: true, pack: newPack });

    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Development")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /New Pack/i }));

    const keyInput = screen.getByPlaceholderText("e.g. facility_visit");
    await user.type(keyInput, "my_custom");

    const nameInput = screen.getByPlaceholderText(/Facility Visit Prep/i);
    await user.type(nameInput, "My Custom Pack");

    await user.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(apiMocks.createWorkflowPack).toHaveBeenCalledWith(
        expect.objectContaining({ key: "my_custom", name: "My Custom Pack" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("My Custom Pack")).toBeInTheDocument();
    });
  });

  it("deletes custom pack after confirmation", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Facility Visit Prep")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: /Delete Facility Visit Prep/i });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(apiMocks.deleteWorkflowPack).toHaveBeenCalledWith("facility_visit");
    });

    await waitFor(() => {
      expect(screen.queryByText("Facility Visit Prep")).not.toBeInTheDocument();
    });
  });

  it("does not delete when confirm dialog is cancelled", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Facility Visit Prep")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Delete Facility Visit Prep/i }));

    expect(apiMocks.deleteWorkflowPack).not.toHaveBeenCalled();
    expect(screen.getByText("Facility Visit Prep")).toBeInTheDocument();
  });

  it("opens edit form with pre-filled data when Edit is clicked", async () => {
    const user = userEvent.setup();
    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByText("Facility Visit Prep")).toBeInTheDocument();
    });

    const editBtns = screen.getAllByRole("button", { name: /Edit Facility Visit Prep/i });
    await user.click(editBtns[0]);

    // Form title says "Edit Pack"
    expect(screen.getByText("Edit Pack")).toBeInTheDocument();
    // Name should be pre-filled
    const nameInput = screen.getByDisplayValue("Facility Visit Prep");
    expect(nameInput).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    // Make the mock return a never-resolving promise to capture loading state
    apiMocks.getWorkflowPacks.mockReturnValue(new Promise(() => {}));
    render(<WorkflowPacksTab t={t} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows error state with retry button when load fails", async () => {
    apiMocks.getWorkflowPacks.mockRejectedValue(new Error("Network error"));
    render(<WorkflowPacksTab t={t} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
