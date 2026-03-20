import type { ComponentProps, FormEventHandler } from "react";
import { WORKFLOW_PACK_KEYS } from "../../../types";
import type { Agent, Department, TaskType, WorkflowPackKey } from "../../../types";
import { TASK_TYPE_OPTIONS, taskTypeLabel, type FormFeedback, type TFunction } from "../constants";
import CreateTaskModalOverlays from "./Overlays";
import type { CreateTaskModalOverlaysProps } from "./overlay-types";
import { AssigneeSection, PrioritySection, ProjectSection } from "./Sections";
import PackSchemaFields from "./PackSchemaFields";
import type { PackInputSchema } from "../../../utils/packPrompt";

interface CreateTaskModalViewProps {
  t: TFunction;
  locale: string;
  createNewProjectMode: boolean;
  draftsCount: number;
  title: string;
  description: string;
  departmentId: string;
  taskType: TaskType;
  priority: number;
  assignAgentId: string;
  submitBusy: boolean;
  formFeedback: FormFeedback | null;
  departments: Department[];
  filteredAgents: Agent[];
  projectSectionProps: ComponentProps<typeof ProjectSection>;
  overlaysProps: CreateTaskModalOverlaysProps;
  // Pack-driven form props
  workflowPackKey: WorkflowPackKey | "";
  packSchema: PackInputSchema | null;
  packName: string;
  packSchemaLoading: boolean;
  isPackMode: boolean;
  packFieldValues: Record<string, string>;
  packNotes: string;
  packPreviewExpanded: boolean;
  assembledPrompt: string;
  // Output path props
  outputPath: string;
  defaultOutputPath: string;
  onOpenDraftModal: () => void;
  onRequestClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
  onTaskTypeChange: (value: TaskType) => void;
  onPriorityChange: (value: number) => void;
  onAssignAgentChange: (value: string) => void;
  onWorkflowPackKeyChange: (key: string) => void;
  onPackFieldChange: (fieldKey: string, value: string) => void;
  onPackNotesChange: (value: string) => void;
  onTogglePackPreview: () => void;
  onOutputPathChange: (value: string) => void;
  onAutoFillOutputPath: () => void;
}

export default function CreateTaskModalView({
  t,
  locale,
  createNewProjectMode,
  draftsCount,
  title,
  description,
  departmentId,
  taskType,
  priority,
  assignAgentId,
  submitBusy,
  formFeedback,
  departments,
  filteredAgents,
  projectSectionProps,
  overlaysProps,
  workflowPackKey,
  packSchema,
  packName,
  packSchemaLoading,
  isPackMode,
  packFieldValues,
  packNotes,
  packPreviewExpanded,
  assembledPrompt,
  outputPath,
  defaultOutputPath,
  onOpenDraftModal,
  onRequestClose,
  onSubmit,
  onTitleChange,
  onDescriptionChange,
  onDepartmentChange,
  onTaskTypeChange,
  onPriorityChange,
  onAssignAgentChange,
  onWorkflowPackKeyChange,
  onPackFieldChange,
  onPackNotesChange,
  onTogglePackPreview,
  onOutputPathChange,
  onAutoFillOutputPath,
}: CreateTaskModalViewProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
    >
      <div
        className={`my-3 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl transition-[max-width] duration-300 ease-out sm:my-0 sm:max-h-[90dvh] lg:max-h-none lg:max-w-2xl ${
          createNewProjectMode ? "lg:max-w-5xl" : ""
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-5">
          <h2 className="text-lg font-bold text-white">
            {t({ ko: "새 업무 만들기", en: "Create New Task", ja: "新しいタスクを作成", zh: "创建新任务" })}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenDraftModal}
              className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
              title={t({
                ko: "임시 저장 항목 열기",
                en: "Open temporary drafts",
                ja: "一時保存を開く",
                zh: "打开临时草稿",
              })}
            >
              {`[${t({ ko: "임시", en: "Temp", ja: "一時", zh: "临时" })}(${draftsCount})]`}
            </button>
            <button
              onClick={onRequestClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              title={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭" })}
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-6 py-4 lg:overflow-visible ${createNewProjectMode ? "lg:grid lg:grid-cols-2 lg:gap-5" : ""}`}
          >
            <div className="min-w-0 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  {t({ ko: "제목", en: "Title", ja: "タイトル", zh: "标题" })} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder={t({
                    ko: "업무 제목을 입력하세요",
                    en: "Enter a task title",
                    ja: "タスクのタイトルを入力してください",
                    zh: "请输入任务标题",
                  })}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Workflow pack selector */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  {t({ ko: "워크플로우 팩", en: "Workflow Pack", ja: "ワークフローパック", zh: "工作流包" })}
                </label>
                <select
                  value={workflowPackKey}
                  onChange={(event) => onWorkflowPackKeyChange(event.target.value)}
                  data-testid="workflow-pack-select"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">
                    {t({ ko: "-- 팩 선택 --", en: "-- Select pack --", ja: "-- パック選択 --", zh: "-- 选择包 --" })}
                  </option>
                  {WORKFLOW_PACK_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
                {packSchemaLoading && (
                  <p className="mt-1 text-xs text-slate-500">
                    {t({ ko: "스키마 불러오는 중...", en: "Loading schema...", ja: "スキーマ読込中...", zh: "加载中..." })}
                  </p>
                )}
              </div>

              {/* Pack-driven fields when schema is available */}
              {isPackMode && packSchema ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    {t({ ko: "업무 상세", en: "Task Details", ja: "タスク詳細", zh: "任务详情" })}
                  </label>
                  <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-3">
                    <PackSchemaFields
                      schema={packSchema}
                      packName={packName}
                      fieldValues={packFieldValues}
                      notes={packNotes}
                      previewExpanded={packPreviewExpanded}
                      assembledPrompt={assembledPrompt}
                      t={t}
                      onFieldChange={onPackFieldChange}
                      onNotesChange={onPackNotesChange}
                      onTogglePreview={onTogglePackPreview}
                    />
                  </div>
                </div>
              ) : (
                /* Free-text description fallback */
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    {t({ ko: "설명", en: "Description", ja: "説明", zh: "说明" })}
                  </label>
                  <textarea
                    value={description}
                    onChange={(event) => onDescriptionChange(event.target.value)}
                    placeholder={t({
                      ko: "업무에 대한 상세 설명을 입력하세요",
                      en: "Enter a detailed description",
                      ja: "タスクの詳細説明を入力してください",
                      zh: "请输入任务详细说明",
                    })}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    {t({ ko: "부서", en: "Department", ja: "部署", zh: "部门" })}
                  </label>
                  <select
                    value={departmentId}
                    onChange={(event) => onDepartmentChange(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">
                      {t({ ko: "-- 전체 --", en: "-- All --", ja: "-- 全体 --", zh: "-- 全部 --" })}
                    </option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.icon} {locale === "ko" ? department.name_ko : department.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    {t({ ko: "업무 유형", en: "Task Type", ja: "タスク種別", zh: "任务类型" })}
                  </label>
                  <select
                    value={taskType}
                    onChange={(event) => onTaskTypeChange(event.target.value as TaskType)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {TASK_TYPE_OPTIONS.map((typeOption) => (
                      <option key={typeOption.value} value={typeOption.value}>
                        {taskTypeLabel(typeOption.value, t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <ProjectSection {...projectSectionProps} />

              {/* Output Path field */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  {t({ ko: "출력 경로", en: "Output Path", ja: "出力パス", zh: "输出路径" })}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    {t({ ko: "(선택)", en: "(optional)", ja: "(任意)", zh: "(可选)" })}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={outputPath}
                    onChange={(event) => onOutputPathChange(event.target.value)}
                    placeholder={defaultOutputPath || t({
                      ko: "예: /path/to/claw_output/",
                      en: "e.g. /path/to/claw_output/",
                      ja: "例: /path/to/claw_output/",
                      zh: "例如: /path/to/claw_output/",
                    })}
                    data-testid="output-path-input"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {defaultOutputPath && (
                    <button
                      type="button"
                      onClick={onAutoFillOutputPath}
                      data-testid="output-path-autofill"
                      className="shrink-0 rounded-lg border border-slate-600 px-2.5 py-2 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
                      title={t({
                        ko: "자동 채우기",
                        en: "Auto-fill",
                        ja: "自動入力",
                        zh: "自动填充",
                      })}
                    >
                      {t({ ko: "자동", en: "Auto", ja: "自動", zh: "自动" })}
                    </button>
                  )}
                </div>
              </div>

              <div className={createNewProjectMode ? "lg:hidden" : ""}>
                <PrioritySection priority={priority} t={t} onPriorityChange={onPriorityChange} />
              </div>
              <div className={createNewProjectMode ? "lg:hidden" : ""}>
                <AssigneeSection
                  agents={filteredAgents}
                  departments={departments}
                  departmentId={departmentId}
                  assignAgentId={assignAgentId}
                  t={t}
                  onAssignAgentChange={onAssignAgentChange}
                />
              </div>
            </div>

            {createNewProjectMode && (
              <aside className="hidden min-w-0 lg:block lg:transition-all lg:duration-300 lg:ease-out">
                <div className="space-y-4 rounded-xl border border-slate-700/80 bg-slate-900/80 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                  <PrioritySection priority={priority} t={t} onPriorityChange={onPriorityChange} />
                  <AssigneeSection
                    agents={filteredAgents}
                    departments={departments}
                    departmentId={departmentId}
                    assignAgentId={assignAgentId}
                    t={t}
                    onAssignAgentChange={onAssignAgentChange}
                  />
                </div>
              </aside>
            )}
          </div>

          {formFeedback && (
            <div className="px-6 pb-3">
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  formFeedback.tone === "error"
                    ? "border-rose-500/60 bg-rose-500/10 text-rose-200"
                    : "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                }`}
              >
                {formFeedback.message}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-700 px-6 py-4">
            <button
              type="button"
              onClick={onRequestClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || submitBusy}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitBusy
                ? t({ ko: "생성 중...", en: "Creating...", ja: "作成中...", zh: "创建中..." })
                : t({ ko: "업무 만들기", en: "Create Task", ja: "タスク作成", zh: "创建任务" })}
            </button>
          </div>
        </form>
      </div>

      <CreateTaskModalOverlays {...overlaysProps} />
    </div>
  );
}
