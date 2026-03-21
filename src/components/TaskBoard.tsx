import { useCallback, useMemo, useRef, useState } from "react";
import { bulkHideTasks } from "../api";
import { useI18n } from "../i18n";
import type { Agent, Department, SubTask, Task, WorkflowPackKey } from "../types";
import ProjectManagerModal from "./ProjectManagerModal";
import BulkHideModal from "./taskboard/BulkHideModal";
import CreateTaskModal from "./taskboard/CreateTaskModal";
import FilterBar from "./taskboard/FilterBar";
import TaskCard from "./taskboard/TaskCard";
import TaskSearchBar from "./taskboard/TaskSearchBar";
import KeyboardHelpModal from "./KeyboardHelpModal";
import { COLUMNS, isHideableStatus, taskStatusLabel, type HideableStatus } from "./taskboard/constants";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useTaskSearch } from "../hooks/useTaskSearch";
import type { TaskFilter } from "../hooks/useTaskSearch";
import type { View } from "../app/types";

interface TaskBoardProps {
  tasks: Task[];
  agents: Agent[];
  departments: Department[];
  subtasks: SubTask[];
  onCreateTask: (input: {
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
  onUpdateTask: (id: string, data: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onAssignTask: (taskId: string, agentId: string) => void;
  onRunTask: (id: string) => void;
  onStopTask: (id: string) => void;
  onPauseTask?: (id: string) => void;
  onResumeTask?: (id: string) => void;
  onOpenTerminal?: (taskId: string) => void;
  onOpenMeetingMinutes?: (taskId: string) => void;
  onMergeTask?: (id: string) => void;
  onDiscardTask?: (id: string) => void;
  onNavigateToView?: (view: View) => void;
}

const EMPTY_FILTER: TaskFilter = {
  query: "",
  status: [],
  packKey: [],
  projectId: [],
  priority: null,
};

export function TaskBoard({
  tasks,
  agents,
  departments,
  subtasks,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onAssignTask,
  onRunTask,
  onStopTask,
  onPauseTask,
  onResumeTask,
  onOpenTerminal,
  onOpenMeetingMinutes,
  onMergeTask,
  onDiscardTask,
  onNavigateToView,
}: TaskBoardProps) {
  void onMergeTask;
  void onDiscardTask;
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showBulkHideModal, setShowBulkHideModal] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [filterDept, setFilterDept] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [showAllTasks, setShowAllTasks] = useState(false);

  // Advanced search filter state
  const [advancedFilter, setAdvancedFilter] = useState<TaskFilter>(EMPTY_FILTER);

  // Task navigation (j/k selection)
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number>(-1);

  // Sequence ref for g→h / g→s shortcuts
  const gPressedRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search input ref for '/' focusing
  const searchInputRef = useRef<HTMLInputElement>(null);

  const hiddenTaskIds = useMemo(
    () => new Set(tasks.filter((task) => task.hidden === 1).map((task) => task.id)),
    [tasks],
  );

  const hideTask = useCallback(
    (taskId: string) => {
      onUpdateTask(taskId, { hidden: 1 });
    },
    [onUpdateTask],
  );

  const unhideTask = useCallback(
    (taskId: string) => {
      onUpdateTask(taskId, { hidden: 0 });
    },
    [onUpdateTask],
  );

  const hideByStatuses = useCallback((statuses: HideableStatus[]) => {
    if (statuses.length === 0) return;
    bulkHideTasks(statuses, 1);
  }, []);

  // Legacy filter (department / agent / type / text search)
  const legacyFilteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterDept && task.department_id !== filterDept) return false;
      if (filterAgent && task.assigned_agent_id !== filterAgent) return false;
      if (filterType && task.task_type !== filterType) return false;
      if (search && !task.title.toLowerCase().includes(search.toLowerCase())) return false;
      const isHidden = hiddenTaskIds.has(task.id);
      if (!showAllTasks && isHidden) return false;
      return true;
    });
  }, [tasks, filterDept, filterAgent, filterType, search, hiddenTaskIds, showAllTasks]);

  // Apply advanced (query + status pills) filter on top of legacy filters
  const filteredTasks = useTaskSearch(legacyFilteredTasks, advancedFilter);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const column of COLUMNS) {
      grouped[column.status] = filteredTasks
        .filter((task) => task.status === column.status)
        .sort((a, b) => b.priority - a.priority || b.created_at - a.created_at);
    }
    return grouped;
  }, [filteredTasks]);

  // Flat list of all visible tasks for j/k navigation
  const flatTaskList = useMemo(() => {
    const result: Task[] = [];
    for (const column of COLUMNS) {
      result.push(...(tasksByStatus[column.status] ?? []));
    }
    return result;
  }, [tasksByStatus]);

  const subtasksByTask = useMemo(() => {
    const grouped: Record<string, SubTask[]> = {};
    for (const subtask of subtasks) {
      if (!grouped[subtask.task_id]) grouped[subtask.task_id] = [];
      grouped[subtask.task_id].push(subtask);
    }
    return grouped;
  }, [subtasks]);

  const activeFilterCount = [filterDept, filterAgent, filterType, search].filter(Boolean).length;
  const hiddenTaskCount = useMemo(() => {
    let count = 0;
    for (const task of tasks) {
      if (isHideableStatus(task.status) && hiddenTaskIds.has(task.id)) count++;
    }
    return count;
  }, [tasks, hiddenTaskIds]);

  // Scroll selected task card into view
  const scrollToTask = useCallback((taskId: string) => {
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      description: "New task",
      handler: () => setShowCreate(true),
      when: () => !showCreate && !showProjectManager && !showBulkHideModal && !showKeyboardHelp,
    },
    {
      key: "/",
      description: "Focus search",
      handler: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
    },
    {
      key: "Escape",
      description: "Close modal / clear search",
      handler: () => {
        if (showKeyboardHelp) {
          setShowKeyboardHelp(false);
          return;
        }
        if (showCreate) {
          setShowCreate(false);
          return;
        }
        if (showProjectManager) {
          setShowProjectManager(false);
          return;
        }
        if (showBulkHideModal) {
          setShowBulkHideModal(false);
          return;
        }
        if (advancedFilter.query || advancedFilter.status.length > 0) {
          setAdvancedFilter(EMPTY_FILTER);
          return;
        }
        setSelectedTaskIndex(-1);
      },
    },
    {
      key: "j",
      description: "Select next task",
      handler: () => {
        setSelectedTaskIndex((prev) => {
          const next = Math.min(prev + 1, flatTaskList.length - 1);
          const task = flatTaskList[next];
          if (task) scrollToTask(task.id);
          return next;
        });
      },
    },
    {
      key: "k",
      description: "Select previous task",
      handler: () => {
        setSelectedTaskIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          const task = flatTaskList[next];
          if (task) scrollToTask(task.id);
          return next;
        });
      },
    },
    {
      key: "Enter",
      description: "Expand selected task",
      handler: () => {
        const task = flatTaskList[selectedTaskIndex];
        if (task) {
          // Click the task title toggle button inside the selected card
          const el = document.querySelector<HTMLButtonElement>(`[data-task-id="${task.id}"] .task-card-expand-btn`);
          el?.click();
        }
      },
      when: () => selectedTaskIndex >= 0 && selectedTaskIndex < flatTaskList.length,
    },
    {
      key: "g",
      description: "Go-to prefix key",
      handler: () => {
        gPressedRef.current = true;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);
        gTimerRef.current = setTimeout(() => {
          gPressedRef.current = false;
        }, 1000);
      },
    },
    {
      key: "h",
      description: "Go to task board (after g)",
      handler: () => {
        if (gPressedRef.current) {
          gPressedRef.current = false;
          if (gTimerRef.current) clearTimeout(gTimerRef.current);
          onNavigateToView?.("tasks");
        }
      },
    },
    {
      key: "s",
      description: "Go to settings (after g)",
      handler: () => {
        if (gPressedRef.current) {
          gPressedRef.current = false;
          if (gTimerRef.current) clearTimeout(gTimerRef.current);
          onNavigateToView?.("settings");
        }
      },
    },
    {
      key: "?",
      shift: true,
      description: "Show keyboard shortcuts help",
      handler: () => setShowKeyboardHelp(true),
    },
  ]);

  return (
    <div className="taskboard-shell flex h-full flex-col gap-4 bg-slate-950 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">
          {t({ ko: "업무 보드", en: "Task Board", ja: "タスクボード", zh: "任务看板" })}
        </h1>
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
          {t({ ko: "총", en: "Total", ja: "合計", zh: "总计" })} {filteredTasks.length}
          {t({ ko: "개", en: "", ja: "件", zh: "项" })}
          {activeFilterCount > 0 &&
            ` (${t({ ko: "필터", en: "filters", ja: "フィルター", zh: "筛选器" })} ${activeFilterCount}${t({
              ko: "개 적용",
              en: " applied",
              ja: "件適用",
              zh: "个已应用",
            })})`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setFilterDept("");
                setFilterAgent("");
                setFilterType("");
                setSearch("");
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              {t({ ko: "필터 초기화", en: "Reset Filters", ja: "フィルターをリセット", zh: "重置筛选" })}
            </button>
          )}
          <button
            onClick={() => setShowAllTasks((prev) => !prev)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              showAllTasks
                ? "border-cyan-600 bg-cyan-900/40 text-cyan-100 hover:bg-cyan-900/60"
                : "border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
            title={
              showAllTasks
                ? t({
                    ko: "진행중 보기로 전환 (숨김 제외)",
                    en: "Switch to active view (exclude hidden)",
                    ja: "進行中表示へ切替（非表示を除外）",
                    zh: "切换到进行中视图（排除隐藏）",
                  })
                : t({
                    ko: "모두보기로 전환 (숨김 포함)",
                    en: "Switch to all view (include hidden)",
                    ja: "全体表示へ切替（非表示を含む）",
                    zh: "切换到全部视图（包含隐藏）",
                  })
            }
          >
            <span className={showAllTasks ? "text-slate-400" : "text-emerald-200"}>
              {t({ ko: "진행중", en: "Active", ja: "進行中", zh: "进行中" })}
            </span>
            <span className="mx-1 text-slate-500">/</span>
            <span className={showAllTasks ? "text-cyan-100" : "text-slate-500"}>
              {t({ ko: "모두보기", en: "All", ja: "すべて", zh: "全部" })}
            </span>
            <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
              {hiddenTaskCount}
            </span>
          </button>
          <button
            onClick={() => setShowBulkHideModal(true)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
            title={t({
              ko: "완료/보류/취소 상태 업무 숨기기",
              en: "Hide done/pending/cancelled tasks",
              ja: "完了/保留/キャンセル状態を非表示",
              zh: "隐藏完成/待处理/已取消任务",
            })}
          >
            🙈 {t({ ko: "숨김", en: "Hide", ja: "非表示", zh: "隐藏" })}
          </button>
          <button
            onClick={() => setShowProjectManager(true)}
            className="taskboard-project-manage-btn rounded-lg border px-3 py-1.5 text-xs font-semibold transition"
          >
            🗂 {t({ ko: "프로젝트 관리", en: "Project Manager", ja: "プロジェクト管理", zh: "项目管理" })}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow transition hover:bg-blue-500 active:scale-95"
          >
            + {t({ ko: "새 업무", en: "New Task", ja: "新規タスク", zh: "新建任务" })}
          </button>
          <button
            onClick={() => setShowKeyboardHelp(true)}
            className="rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
            title={t({
              ko: "키보드 단축키 (?)",
              en: "Keyboard shortcuts (?)",
              ja: "キーボードショートカット (?)",
              zh: "键盘快捷键 (?)",
            })}
            aria-label={t({
              ko: "키보드 단축키",
              en: "Keyboard shortcuts",
              ja: "キーボードショートカット",
              zh: "键盘快捷键",
            })}
          >
            ?
          </button>
        </div>
      </div>

      {/* Advanced search + status filter bar */}
      <TaskSearchBar
        filter={advancedFilter}
        totalCount={legacyFilteredTasks.length}
        filteredCount={filteredTasks.length}
        onFilterChange={setAdvancedFilter}
        searchRef={searchInputRef}
      />

      <FilterBar
        agents={agents}
        departments={departments}
        filterDept={filterDept}
        filterAgent={filterAgent}
        filterType={filterType}
        search={search}
        onFilterDept={setFilterDept}
        onFilterAgent={setFilterAgent}
        onFilterType={setFilterType}
        onSearch={setSearch}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2 sm:flex-row sm:overflow-x-auto sm:overflow-y-hidden">
        {COLUMNS.map((column) => {
          const columnTasks = tasksByStatus[column.status] ?? [];
          return (
            <div
              key={column.status}
              className={`taskboard-column flex w-full flex-col rounded-xl border sm:w-72 sm:flex-shrink-0 ${column.borderColor} bg-slate-900`}
            >
              <div className={`flex items-center justify-between rounded-t-xl ${column.headerBg} px-3.5 py-2.5`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${column.dotColor}`} />
                  <span className="text-sm font-semibold text-white">
                    {column.icon} {taskStatusLabel(column.status, t)}
                  </span>
                </div>
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-bold text-white/80">
                  {columnTasks.length}
                </span>
              </div>

              <div className="flex flex-col gap-2.5 p-2.5 sm:flex-1 sm:overflow-y-auto">
                {columnTasks.length === 0 ? (
                  <div className="flex min-h-24 items-center justify-center py-8 text-xs text-slate-600 sm:flex-1">
                    {t({ ko: "업무 없음", en: "No tasks", ja: "タスクなし", zh: "暂无任务" })}
                  </div>
                ) : (
                  columnTasks.map((task) => {
                    const flatIndex = flatTaskList.findIndex((ft) => ft.id === task.id);
                    const isSelected = flatIndex === selectedTaskIndex && selectedTaskIndex >= 0;
                    return (
                      <div
                        key={task.id}
                        data-task-id={task.id}
                        className={isSelected ? "rounded-xl ring-2 ring-blue-500" : ""}
                        onClick={() => setSelectedTaskIndex(flatIndex)}
                      >
                        <TaskCard
                          task={task}
                          agents={agents}
                          departments={departments}
                          taskSubtasks={subtasksByTask[task.id] ?? []}
                          isHiddenTask={hiddenTaskIds.has(task.id)}
                          onUpdateTask={onUpdateTask}
                          onDeleteTask={onDeleteTask}
                          onAssignTask={onAssignTask}
                          onRunTask={onRunTask}
                          onStopTask={onStopTask}
                          onPauseTask={onPauseTask}
                          onResumeTask={onResumeTask}
                          onOpenTerminal={onOpenTerminal}
                          onOpenMeetingMinutes={onOpenMeetingMinutes}
                          onMergeTask={onMergeTask}
                          onDiscardTask={onDiscardTask}
                          onHideTask={hideTask}
                          onUnhideTask={unhideTask}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateTaskModal
          agents={agents}
          departments={departments}
          onClose={() => setShowCreate(false)}
          onCreate={onCreateTask}
          onAssign={onAssignTask}
        />
      )}

      {showProjectManager && (
        <ProjectManagerModal agents={agents} departments={departments} onClose={() => setShowProjectManager(false)} />
      )}

      {showBulkHideModal && (
        <BulkHideModal
          tasks={tasks}
          hiddenTaskIds={hiddenTaskIds}
          onClose={() => setShowBulkHideModal(false)}
          onApply={(statuses) => {
            hideByStatuses(statuses);
            setShowBulkHideModal(false);
          }}
        />
      )}

      {showKeyboardHelp && <KeyboardHelpModal onClose={() => setShowKeyboardHelp(false)} />}
    </div>
  );
}

export default TaskBoard;
