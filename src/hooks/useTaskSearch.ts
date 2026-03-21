import { useMemo } from "react";
import type { Task } from "../types";

export interface TaskFilter {
  query: string;
  status: string[]; // [] = all
  packKey: string[]; // [] = all
  projectId: string[]; // [] = all
  priority: number | null; // null = all
}

export function useTaskSearch(tasks: Task[], filter: TaskFilter): Task[] {
  return useMemo(() => {
    let result = tasks;

    if (filter.query.trim()) {
      const q = filter.query.toLowerCase();
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
      );
    }

    if (filter.status.length > 0) {
      result = result.filter((t) => filter.status.includes(t.status));
    }

    if (filter.packKey.length > 0) {
      result = result.filter((t) => filter.packKey.includes(t.workflow_pack_key ?? ""));
    }

    if (filter.projectId.length > 0) {
      result = result.filter((t) => filter.projectId.includes(t.project_id ?? ""));
    }

    if (filter.priority !== null) {
      result = result.filter((t) => (t.priority ?? 0) >= filter.priority!);
    }

    return result;
  }, [tasks, filter]);
}
