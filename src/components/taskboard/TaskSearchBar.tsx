import { useRef, useEffect, useCallback } from "react";
import type { RefObject } from "react";
import { useI18n } from "../../i18n";
import type { TaskFilter } from "../../hooks/useTaskSearch";

interface TaskSearchBarProps {
  filter: TaskFilter;
  totalCount: number;
  filteredCount: number;
  onFilterChange: (filter: TaskFilter) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}

const STATUS_PILLS = ["inbox", "planned", "in_progress", "review", "done", "pending", "cancelled"] as const;

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function TaskSearchBar({
  filter,
  totalCount,
  filteredCount,
  onFilterChange,
  searchRef: externalRef,
}: TaskSearchBarProps) {
  const { t } = useI18n();
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;

  const setQuery = useCallback(
    (query: string) => {
      onFilterChange({ ...filter, query });
    },
    [filter, onFilterChange],
  );

  const toggleStatus = useCallback(
    (status: string) => {
      const next = filter.status.includes(status)
        ? filter.status.filter((s) => s !== status)
        : [...filter.status, status];
      onFilterChange({ ...filter, status: next });
    },
    [filter, onFilterChange],
  );

  const clearFilters = useCallback(() => {
    onFilterChange({
      query: "",
      status: [],
      packKey: [],
      projectId: [],
      priority: null,
    });
  }, [onFilterChange]);

  const activeFilterCount =
    (filter.query.trim() ? 1 : 0) +
    (filter.status.length > 0 ? 1 : 0) +
    (filter.packKey.length > 0 ? 1 : 0) +
    (filter.projectId.length > 0 ? 1 : 0) +
    (filter.priority !== null ? 1 : 0);

  const isFiltered = filteredCount < totalCount;

  // Close/clear on Escape when search is focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        if (filter.query) {
          setQuery("");
        } else {
          inputRef.current?.blur();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filter.query, setQuery, inputRef]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm select-none">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder={t({
              ko: "태스크 검색... (/)",
              en: "Search tasks... (/)",
              ja: "タスク検索... (/)",
              zh: "搜索任务... (/)",
            })}
            value={filter.query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-8 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          {filter.query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition text-xs"
              aria-label={t({ ko: "검색 지우기", en: "Clear search", ja: "検索クリア", zh: "清除搜索" })}
            >
              ✕
            </button>
          )}
        </div>

        {/* Active filter badge + clear */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-xs text-amber-400 hover:text-amber-300 transition whitespace-nowrap"
          >
            {activeFilterCount} {t({ ko: "필터", en: "filter", ja: "フィルター", zh: "筛选" })}
            {activeFilterCount > 1 ? t({ ko: "", en: "s", ja: "", zh: "" }) : ""} ✕
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1">
        {STATUS_PILLS.map((s) => (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            className={cn(
              "px-2 py-0.5 text-xs rounded-full border transition-colors",
              filter.status.includes(s)
                ? "bg-blue-600 border-blue-500 text-white"
                : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300",
            )}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Result count */}
      {isFiltered && (
        <p className="text-xs text-slate-500">
          {t({
            ko: `${filteredCount} / ${totalCount}건 표시 중`,
            en: `Showing ${filteredCount} of ${totalCount} tasks`,
            ja: `${totalCount}件中 ${filteredCount}件表示`,
            zh: `显示 ${filteredCount} / ${totalCount} 个任务`,
          })}
        </p>
      )}
    </div>
  );
}
