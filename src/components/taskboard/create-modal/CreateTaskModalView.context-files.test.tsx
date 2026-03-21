import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import CreateTaskModalView from "./CreateTaskModalView";
import type { PackInputSchema } from "../../../utils/packPrompt";

// Re-use the same minimal stubs from the pack test
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

function makeBaseProps(overrides: {
  contextFiles?: string[];
  onAddContextFile?: () => void;
  onUpdateContextFile?: (i: number, v: string) => void;
  onRemoveContextFile?: (i: number) => void;
  packSchema?: PackInputSchema | null;
  isPackMode?: boolean;
}) {
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
    workflowPackKey: "" as never,
    packSchema: overrides.packSchema ?? null,
    packName: "Test Pack",
    packSchemaLoading: false,
    isPackMode: overrides.isPackMode ?? false,
    packFieldValues: {},
    packNotes: "",
    packPreviewExpanded: false,
    assembledPrompt: "",
    outputPath: "",
    defaultOutputPath: "",
    contextFiles: overrides.contextFiles ?? [],
    onAddContextFile: overrides.onAddContextFile ?? vi.fn(),
    onUpdateContextFile: overrides.onUpdateContextFile ?? vi.fn(),
    onRemoveContextFile: overrides.onRemoveContextFile ?? vi.fn(),
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
  };
}

describe("CreateTaskModalView — context files field", () => {
  it("renders the context files section", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeBaseProps({})} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("context-files-section")).toBeInTheDocument();
  });

  it("renders the add context file button", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeBaseProps({})} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("context-file-add")).toBeInTheDocument();
  });

  it("calls onAddContextFile when add button is clicked", () => {
    const onAddContextFile = vi.fn();
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeBaseProps({ onAddContextFile })} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId("context-file-add"));
    expect(onAddContextFile).toHaveBeenCalledTimes(1);
  });

  it("renders an input for each context file entry", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeBaseProps({ contextFiles: ["/path/a.md", "/path/b.md"] })} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("context-file-input-0")).toBeInTheDocument();
    expect(screen.getByTestId("context-file-input-1")).toBeInTheDocument();
  });

  it("displays the current value in each context file input", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeBaseProps({ contextFiles: ["/path/to/note.md"] })} />
      </I18nProvider>,
    );
    const input = screen.getByTestId("context-file-input-0") as HTMLInputElement;
    expect(input.value).toBe("/path/to/note.md");
  });

  it("calls onUpdateContextFile when a context file input changes", () => {
    const onUpdateContextFile = vi.fn();
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeBaseProps({ contextFiles: [""], onUpdateContextFile })} />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByTestId("context-file-input-0"), {
      target: { value: "/new/path.md" },
    });
    expect(onUpdateContextFile).toHaveBeenCalledWith(0, "/new/path.md");
  });

  it("renders a remove button for each context file", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeBaseProps({ contextFiles: ["/a.md", "/b.md"] })} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("context-file-remove-0")).toBeInTheDocument();
    expect(screen.getByTestId("context-file-remove-1")).toBeInTheDocument();
  });

  it("calls onRemoveContextFile with the correct index when remove is clicked", () => {
    const onRemoveContextFile = vi.fn();
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeBaseProps({ contextFiles: ["/a.md", "/b.md"], onRemoveContextFile })} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId("context-file-remove-1"));
    expect(onRemoveContextFile).toHaveBeenCalledWith(1);
  });

  it("renders no file inputs when contextFiles is empty", () => {
    render(
      <I18nProvider language="en">
        <CreateTaskModalView {...makeBaseProps({ contextFiles: [] })} />
      </I18nProvider>,
    );
    expect(screen.queryByTestId("context-file-input-0")).not.toBeInTheDocument();
  });
});
