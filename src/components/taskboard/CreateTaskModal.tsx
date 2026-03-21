import { useCallback, useMemo, useState } from "react";
import type { Agent, Department, TaskType, WorkflowPackKey } from "../../types";
import { useI18n } from "../../i18n";
import { type CreateTaskDraft, type FormFeedback } from "./constants";
import type { CreateTaskModalOverlaysProps } from "./create-modal/overlay-types";
import CreateTaskModalView from "./create-modal/CreateTaskModalView";
import { submitTaskWithProjectHandling } from "./create-modal/submit-task";
import { useDraftState } from "./create-modal/useDraftState";
import { usePathHelperMessages } from "./create-modal/usePathHelperMessages";
import { useProjectPickerState } from "./create-modal/useProjectPickerState";
import { usePackSchema } from "./create-modal/usePackSchema";
import { assemblePackPrompt, hasSchemaFields } from "../../utils/packPrompt";

interface CreateModalProps {
  agents: Agent[];
  departments: Department[];
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description?: string;
    department_id?: string;
    task_type?: string;
    priority?: number;
    project_id?: string;
    project_path?: string;
    assigned_agent_id?: string;
    workflow_pack_key?: WorkflowPackKey;
    workflow_meta_json?: Record<string, unknown>;
  }) => void;
  onAssign: (taskId: string, agentId: string) => void;
}

function CreateModal({ agents, departments, onClose, onCreate, onAssign }: CreateModalProps) {
  void onAssign;
  const { t, language: locale, locale: localeTag } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("general");
  const [priority, setPriority] = useState(3);
  const [assignAgentId, setAssignAgentId] = useState("");
  const [workflowPackKey, setWorkflowPackKey] = useState<WorkflowPackKey | "">("");
  const [packFieldValues, setPackFieldValues] = useState<Record<string, string>>({});
  const [packNotes, setPackNotes] = useState("");
  const [packPreviewExpanded, setPackPreviewExpanded] = useState(false);
  const [outputPath, setOutputPath] = useState("");
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitWithoutProjectPromptOpen, setSubmitWithoutProjectPromptOpen] = useState(false);
  const [formFeedback, setFormFeedback] = useState<FormFeedback | null>(null);

  const { schema: packSchema, packName, loading: packSchemaLoading } = usePackSchema(workflowPackKey);
  const isPackMode = hasSchemaFields(packSchema) && !packSchemaLoading;

  const assembledDescription = isPackMode
    ? assemblePackPrompt(packName, packSchema!, packFieldValues, packNotes)
    : description;

  // Build workflow_meta_json merging context_files and facility (for ZK auto-inject)
  const workflowMetaJson = useMemo(() => {
    const meta: Record<string, unknown> = {};
    const validFiles = contextFiles.filter((f) => f.trim().length > 0);
    if (validFiles.length > 0) meta.context_files = validFiles;
    // Auto-populate facility from facility_visit pack field for ZK injection
    if (workflowPackKey === "facility_visit" && packFieldValues.facility?.trim()) {
      meta.facility = packFieldValues.facility.trim();
    }
    return Object.keys(meta).length > 0 ? meta : null;
  }, [contextFiles, workflowPackKey, packFieldValues.facility]);

  const filteredAgents = useMemo(
    () => (departmentId ? agents.filter((agent) => agent.department_id === departmentId) : agents),
    [agents, departmentId],
  );

  const { unsupportedPathApiMessage, resolvePathHelperErrorMessage } = usePathHelperMessages(t);

  const projectPicker = useProjectPickerState({
    unsupportedPathApiMessage,
    resolvePathHelperErrorMessage,
    setFormFeedback,
    setSubmitWithoutProjectPromptOpen,
  });

  const applyFormStateFromDraft = useCallback(
    (draft: CreateTaskDraft) => {
      setTitle(draft.title);
      setDescription(draft.description);
      setDepartmentId(draft.departmentId);
      setTaskType(draft.taskType);
      setPriority(draft.priority);
      setAssignAgentId(draft.assignAgentId);
      projectPicker.setProjectId(draft.projectId);
      projectPicker.setProjectQuery(draft.projectQuery);
      projectPicker.setCreateNewProjectMode(draft.createNewProjectMode);
      projectPicker.setNewProjectPath(draft.newProjectPath);
      projectPicker.setProjectDropdownOpen(false);
      projectPicker.setProjectActiveIndex(-1);
    },
    [projectPicker],
  );

  const {
    drafts,
    restorePromptOpen,
    setRestorePromptOpen,
    selectedRestoreDraftId,
    setSelectedRestoreDraftId,
    draftModalOpen,
    setDraftModalOpen,
    restoreCandidates,
    selectedRestoreDraft,
    formatDraftTimestamp,
    applyDraft,
    deleteDraft,
    clearDrafts,
    handleRequestClose,
  } = useDraftState({
    localeTag,
    submitBusy,
    formState: {
      title,
      description,
      departmentId,
      taskType,
      priority,
      assignAgentId,
      projectId: projectPicker.projectId,
      projectQuery: projectPicker.projectQuery,
      createNewProjectMode: projectPicker.createNewProjectMode,
      newProjectPath: projectPicker.newProjectPath,
    },
    applyFormState: applyFormStateFromDraft,
    onClose,
  });

  async function submitTask(options?: { allowCreateMissingPath?: boolean; allowWithoutProject?: boolean }) {
    await submitTaskWithProjectHandling(
      {
        title,
        description: assembledDescription,
        departmentId,
        taskType,
        priority,
        assignAgentId,
        projectId: projectPicker.projectId,
        projectQuery: projectPicker.projectQuery,
        createNewProjectMode: projectPicker.createNewProjectMode,
        newProjectPath: projectPicker.newProjectPath,
        workflowMetaJson,
        selectedProject: projectPicker.selectedProject,
        projects: projectPicker.projects,
        submitBusy,
        t,
        unsupportedPathApiMessage,
        resolvePathHelperErrorMessage,
        onCreate,
        onClose,
        selectProject: projectPicker.selectProject,
        setFormFeedback,
        setSubmitWithoutProjectPromptOpen,
        setSubmitBusy,
        setProjectId: projectPicker.setProjectId,
        setProjectQuery: projectPicker.setProjectQuery,
        setCreateNewProjectMode: projectPicker.setCreateNewProjectMode,
        setProjects: projectPicker.setProjects,
        setMissingPathPrompt: projectPicker.setMissingPathPrompt,
        setNewProjectPath: projectPicker.setNewProjectPath,
        setPathApiUnsupported: projectPicker.setPathApiUnsupported,
        setProjectDropdownOpen: projectPicker.setProjectDropdownOpen,
      },
      options,
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submitTask();
  }

  const handlePriorityChange = useCallback((nextPriority: number) => {
    setPriority(nextPriority);
    setFormFeedback(null);
  }, []);

  const handleAssignAgentChange = useCallback((agentIdValue: string) => {
    setAssignAgentId(agentIdValue);
    setFormFeedback(null);
  }, []);

  const handleAddContextFile = useCallback(() => {
    setContextFiles((prev) => [...prev, ""]);
  }, []);

  const handleUpdateContextFile = useCallback((index: number, value: string) => {
    setContextFiles((prev) => prev.map((f, i) => (i === index ? value : f)));
  }, []);

  const handleRemoveContextFile = useCallback((index: number) => {
    setContextFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const projectSectionProps = {
    t,
    projectPickerRef: projectPicker.projectPickerRef,
    projectQuery: projectPicker.projectQuery,
    projectDropdownOpen: projectPicker.projectDropdownOpen,
    projectActiveIndex: projectPicker.projectActiveIndex,
    projectsLoading: projectPicker.projectsLoading,
    filteredProjects: projectPicker.filteredProjects,
    selectedProject: projectPicker.selectedProject,
    projects: projectPicker.projects,
    createNewProjectMode: projectPicker.createNewProjectMode,
    newProjectPath: projectPicker.newProjectPath,
    pathApiUnsupported: projectPicker.pathApiUnsupported,
    pathSuggestionsOpen: projectPicker.pathSuggestionsOpen,
    pathSuggestionsLoading: projectPicker.pathSuggestionsLoading,
    pathSuggestions: projectPicker.pathSuggestions,
    missingPathPrompt: projectPicker.missingPathPrompt,
    nativePathPicking: projectPicker.nativePathPicking,
    nativePickerUnsupported: projectPicker.nativePickerUnsupported,
    onProjectQueryChange: projectPicker.handleProjectQueryChange,
    onProjectInputFocus: () => projectPicker.setProjectDropdownOpen(true),
    onProjectInputKeyDown: projectPicker.handleProjectInputKeyDown,
    onToggleProjectDropdown: projectPicker.handleToggleProjectDropdown,
    onSelectProject: projectPicker.selectProject,
    onProjectHover: projectPicker.handleProjectHover,
    onEnableCreateNewProject: projectPicker.handleEnableCreateNewProject,
    onNewProjectPathChange: projectPicker.handleNewProjectPathChange,
    onOpenManualPathBrowser: projectPicker.handleOpenManualPathBrowser,
    onTogglePathSuggestions: projectPicker.handleTogglePathSuggestions,
    onPickNativePath: () => {
      void projectPicker.handlePickNativePath();
    },
    onSelectPathSuggestion: projectPicker.handleSelectPathSuggestion,
  } as const;

  const overlaysProps: CreateTaskModalOverlaysProps = {
    t,
    localeTag,
    restorePromptOpen,
    selectedRestoreDraft,
    restoreCandidates,
    selectedRestoreDraftId,
    formatDraftTimestamp,
    submitWithoutProjectPromptOpen,
    missingPathPrompt: projectPicker.missingPathPrompt,
    submitBusy,
    manualPathPickerOpen: projectPicker.manualPathPickerOpen,
    manualPathLoading: projectPicker.manualPathLoading,
    manualPathCurrent: projectPicker.manualPathCurrent,
    manualPathParent: projectPicker.manualPathParent,
    manualPathEntries: projectPicker.manualPathEntries,
    manualPathTruncated: projectPicker.manualPathTruncated,
    manualPathError: projectPicker.manualPathError,
    draftModalOpen,
    drafts,
    onSelectRestoreDraft: (draftId) => setSelectedRestoreDraftId(draftId),
    onCloseRestorePrompt: () => setRestorePromptOpen(false),
    onLoadSelectedRestoreDraft: () => {
      if (!selectedRestoreDraft) return;
      applyDraft(selectedRestoreDraft);
      setRestorePromptOpen(false);
    },
    onCloseSubmitWithoutProjectPrompt: () => setSubmitWithoutProjectPromptOpen(false),
    onConfirmSubmitWithoutProject: () => {
      setSubmitWithoutProjectPromptOpen(false);
      void submitTask({ allowWithoutProject: true });
    },
    onCloseMissingPathPrompt: () => projectPicker.setMissingPathPrompt(null),
    onConfirmCreateMissingPath: () => {
      projectPicker.setMissingPathPrompt(null);
      void submitTask({ allowCreateMissingPath: true });
    },
    onCloseManualPathPicker: () => projectPicker.setManualPathPickerOpen(false),
    onManualPathGoUp: () => {
      if (!projectPicker.manualPathParent) return;
      void projectPicker.loadManualPathEntries(projectPicker.manualPathParent);
    },
    onManualPathRefresh: () => void projectPicker.loadManualPathEntries(projectPicker.manualPathCurrent || undefined),
    onOpenManualPathEntry: (entryPath) => {
      void projectPicker.loadManualPathEntries(entryPath);
    },
    onSelectManualCurrentPath: () => {
      if (!projectPicker.manualPathCurrent) return;
      projectPicker.setNewProjectPath(projectPicker.manualPathCurrent);
      projectPicker.setMissingPathPrompt(null);
      projectPicker.setManualPathPickerOpen(false);
    },
    onCloseDraftModal: () => setDraftModalOpen(false),
    onLoadDraft: (draft) => {
      applyDraft(draft);
      setDraftModalOpen(false);
    },
    onDeleteDraft: deleteDraft,
    onClearDrafts: clearDrafts,
  };

  // Auto-fill output path when project changes
  const selectedProjectPath = projectPicker.selectedProject?.project_path ?? projectPicker.newProjectPath ?? "";
  const defaultOutputPath = selectedProjectPath ? `${selectedProjectPath}/claw_output/` : "";

  return (
    <CreateTaskModalView
      t={t}
      locale={locale}
      createNewProjectMode={projectPicker.createNewProjectMode}
      draftsCount={drafts.length}
      title={title}
      description={description}
      departmentId={departmentId}
      taskType={taskType}
      priority={priority}
      assignAgentId={assignAgentId}
      submitBusy={submitBusy}
      formFeedback={formFeedback}
      departments={departments}
      filteredAgents={filteredAgents}
      projectSectionProps={projectSectionProps}
      overlaysProps={overlaysProps}
      workflowPackKey={workflowPackKey}
      packSchema={packSchema}
      packName={packName}
      packSchemaLoading={packSchemaLoading}
      isPackMode={isPackMode}
      packFieldValues={packFieldValues}
      packNotes={packNotes}
      packPreviewExpanded={packPreviewExpanded}
      assembledPrompt={assembledDescription}
      outputPath={outputPath}
      defaultOutputPath={defaultOutputPath}
      onOpenDraftModal={() => {
        setRestorePromptOpen(false);
        setDraftModalOpen(true);
      }}
      onRequestClose={handleRequestClose}
      onSubmit={handleSubmit}
      onTitleChange={(value) => {
        setTitle(value);
        setFormFeedback(null);
      }}
      onDescriptionChange={(value) => {
        setDescription(value);
        setFormFeedback(null);
      }}
      onDepartmentChange={(value) => {
        setFormFeedback(null);
        setDepartmentId(value);
        setAssignAgentId("");
      }}
      onTaskTypeChange={(value) => {
        setTaskType(value);
        setFormFeedback(null);
      }}
      onPriorityChange={handlePriorityChange}
      onAssignAgentChange={handleAssignAgentChange}
      onWorkflowPackKeyChange={(key) => {
        setWorkflowPackKey(key as WorkflowPackKey | "");
        setPackFieldValues({});
        setPackNotes("");
        setPackPreviewExpanded(false);
        setFormFeedback(null);
      }}
      onPackFieldChange={(fieldKey, value) => {
        setPackFieldValues((prev) => ({ ...prev, [fieldKey]: value }));
      }}
      onPackNotesChange={setPackNotes}
      onTogglePackPreview={() => setPackPreviewExpanded((prev) => !prev)}
      onOutputPathChange={setOutputPath}
      onAutoFillOutputPath={() => setOutputPath(defaultOutputPath)}
      contextFiles={contextFiles}
      onAddContextFile={handleAddContextFile}
      onUpdateContextFile={handleUpdateContextFile}
      onRemoveContextFile={handleRemoveContextFile}
    />
  );
}

export default CreateModal;
