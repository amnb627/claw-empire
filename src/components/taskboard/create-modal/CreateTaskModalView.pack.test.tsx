import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import CreateTaskModalView from "./CreateTaskModalView";
import type { PackInputSchema } from "../../../utils/packPrompt";
import { assemblePackPrompt } from "../../../utils/packPrompt";

// Minimal stub for ProjectSection props
const minimalProjectSectionProps = {
  t: (m: Record<string, string>) => m.en,
  projectPickerRef: { current: null },
  projectQuery: "",
  projectDropdownOpen: false,
  projectActiveIndex: -1,
  projectsLoading: false,
  filteredProjects: [],
  selectedProject: null,
  projects: [],
  createNewProjectMode: false,
  newProjectPath: "",
  pathApiUnsupported: false,
  pathSuggestionsOpen: false,
  pathSuggestionsLoading: false,
  pathSuggestions: [],
  missingPathPrompt: null,
  nativePathPicking: false,
  nativePickerUnsupported: false,
  onProjectQueryChange: vi.fn(),
  onProjectInputFocus: vi.fn(),
  onProjectInputKeyDown: vi.fn(),
  onToggleProjectDropdown: vi.fn(),
  onSelectProject: vi.fn(),
  onProjectHover: vi.fn(),
  onEnableCreateNewProject: vi.fn(),
  onNewProjectPathChange: vi.fn(),
  onOpenManualPathBrowser: vi.fn(),
  onTogglePathSuggestions: vi.fn(),
  onPickNativePath: vi.fn(),
  onSelectPathSuggestion: vi.fn(),
};

const minimalOverlaysProps = {
  t: (m: Record<string, string>) => m.en,
  localeTag: "en",
  restorePromptOpen: false,
  selectedRestoreDraft: null,
  restoreCandidates: [],
  selectedRestoreDraftId: null,
  formatDraftTimestamp: vi.fn(),
  submitWithoutProjectPromptOpen: false,
  missingPathPrompt: null,
  submitBusy: false,
  manualPathPickerOpen: false,
  manualPathLoading: false,
  manualPathCurrent: "",
  manualPathParent: null,
  manualPathEntries: [],
  manualPathTruncated: false,
  manualPathError: null,
  draftModalOpen: false,
  drafts: [],
  onSelectRestoreDraft: vi.fn(),
  onCloseRestorePrompt: vi.fn(),
  onLoadSelectedRestoreDraft: vi.fn(),
  onCloseSubmitWithoutProjectPrompt: vi.fn(),
  onConfirmSubmitWithoutProject: vi.fn(),
  onCloseMissingPathPrompt: vi.fn(),
  onConfirmCreateMissingPath: vi.fn(),
  onCloseManualPathPicker: vi.fn(),
  onManualPathGoUp: vi.fn(),
  onManualPathRefresh: vi.fn(),
  onOpenManualPathEntry: vi.fn(),
  onSelectManualCurrentPath: vi.fn(),
  onCloseDraftModal: vi.fn(),
  onLoadDraft: vi.fn(),
  onDeleteDraft: vi.fn(),
  onClearDrafts: vi.fn(),
};

function makeProps(overrides: {
  isPackMode?: boolean;
  packSchema?: PackInputSchema | null;
  outputPath?: string;
  defaultOutputPath?: string;
  workflowPackKey?: string;
}) {
  const schema: PackInputSchema | null = overrides.packSchema ?? null;
  const prompt = schema ? assemblePackPrompt("Test Pack", schema, {}, "") : "";

  return {
    t: (m: Record<string, string>) => m.en,
    locale: "en",
    createNewProjectMode: false,
    draftsCount: 0,
    title: "My Task",
    description: "",
    departmentId: "",
    taskType: "general" as const,
    priority: 3,
    assignAgentId: "",
    submitBusy: false,
    formFeedback: null,
    departments: [],
    filteredAgents: [],
    projectSectionProps: minimalProjectSectionProps,
    overlaysProps: minimalOverlaysProps,
    workflowPackKey: (overrides.workflowPackKey ?? "") as never,
    packSchema: schema,
    packName: "Test Pack",
    packSchemaLoading: false,
    isPackMode: overrides.isPackMode ?? false,
    packFieldValues: {},
    packNotes: "",
    packPreviewExpanded: false,
    assembledPrompt: prompt,
    outputPath: overrides.outputPath ?? "",
    defaultOutputPath: overrides.defaultOutputPath ?? "",
    onOpenDraftModal: vi.fn(),
    onRequestClose: vi.fn(),
    onSubmit: vi.fn(),
    onTitleChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onDepartmentChange: vi.fn(),
    onTaskTypeChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onAssignAgentChange: vi.fn(),
    onWorkflowPackKeyChange: vi.fn(),
    onPackFieldChange: vi.fn(),
    onPackNotesChange: vi.fn(),
    onTogglePackPreview: vi.fn(),
    onOutputPathChange: vi.fn(),
    onAutoFillOutputPath: vi.fn(),
    contextFiles: [],
    onAddContextFile: vi.fn(),
    onUpdateContextFile: vi.fn(),
    onRemoveContextFile: vi.fn(),
  };
}

describe("CreateTaskModalView — workflow pack select", () => {
  it("renders the workflow pack selector", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({})} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("workflow-pack-select")).toBeInTheDocument();
  });

  it("calls onWorkflowPackKeyChange when a pack is selected", () => {
    const onWorkflowPackKeyChange = vi.fn();
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({})} onWorkflowPackKeyChange={onWorkflowPackKeyChange} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByTestId("workflow-pack-select"), { target: { value: "report" } });
    expect(onWorkflowPackKeyChange).toHaveBeenCalledWith("report");
  });

  it("shows pack-driven fields when isPackMode is true and schema has fields", () => {
    const schema: PackInputSchema = { required: ["facility", "visit_date"], optional: ["notes"] };
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({ isPackMode: true, packSchema: schema })} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("pack-field-facility")).toBeInTheDocument();
    expect(screen.getByTestId("pack-field-visit_date")).toBeInTheDocument();
  });

  it("falls back to free-text description when isPackMode is false", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({ isPackMode: false, packSchema: null })} />
      </I18nProvider>,
    );
    // The description textarea exists in free-text mode
    expect(screen.getByPlaceholderText("Enter a detailed description")).toBeInTheDocument();
    // Pack fields are not rendered
    expect(screen.queryByTestId("pack-field-facility")).not.toBeInTheDocument();
  });

  it("falls back to free-text description when pack schema is null even if key is selected", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({ isPackMode: false, packSchema: null, workflowPackKey: "development" })} />
      </I18nProvider>,
    );
    expect(screen.getByPlaceholderText("Enter a detailed description")).toBeInTheDocument();
  });
});

describe("CreateTaskModalView — output path field", () => {
  it("renders the output path input", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({})} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("output-path-input")).toBeInTheDocument();
  });

  it("shows auto-fill button when defaultOutputPath is set", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({ defaultOutputPath: "/project/claw_output/" })} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("output-path-autofill")).toBeInTheDocument();
  });

  it("does not show auto-fill button when defaultOutputPath is empty", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({ defaultOutputPath: "" })} />
      </I18nProvider>,
    );
    expect(screen.queryByTestId("output-path-autofill")).not.toBeInTheDocument();
  });

  it("calls onAutoFillOutputPath when auto-fill button is clicked", () => {
    const onAutoFillOutputPath = vi.fn();
    render(
      <I18nProvider language="en">
        <CreateTaskModalView
          {...makeProps({ defaultOutputPath: "/project/claw_output/" })}
          onAutoFillOutputPath={onAutoFillOutputPath}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId("output-path-autofill"));
    expect(onAutoFillOutputPath).toHaveBeenCalledTimes(1);
  });

  it("displays the current output path value", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({ outputPath: "/my/custom/path/" })} />
      </I18nProvider>,
    );
    const input = screen.getByTestId("output-path-input") as HTMLInputElement;
    expect(input.value).toBe("/my/custom/path/");
  });

  it("calls onOutputPathChange when user types in output path field", () => {
    const onOutputPathChange = vi.fn();
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeProps({})} onOutputPathChange={onOutputPathChange} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByTestId("output-path-input"), { target: { value: "/new/path/" } });
    expect(onOutputPathChange).toHaveBeenCalledWith("/new/path/");
  });
});
