import { useEffect, useRef, useState } from "react";
import { getWorkflowPacks } from "../../../api";
import type { WorkflowPackConfig } from "../../../api";
import { normalizePackInputSchema, type PackInputSchema } from "../../../utils/packPrompt";

interface UsePackSchemaResult {
  schema: PackInputSchema | null;
  packName: string;
  loading: boolean;
}

/**
 * Fetches the input schema for the selected workflow pack key.
 * Uses the existing GET /api/workflow-packs (list) endpoint since there is no
 * single-pack endpoint; results are cached in a module-level map to avoid
 * redundant network calls across multiple modal opens.
 */
const _packCache = new Map<string, WorkflowPackConfig>();
let _cachePromise: Promise<void> | null = null;

function warmCache(): Promise<void> {
  if (_cachePromise) return _cachePromise;
  _cachePromise = getWorkflowPacks()
    .then(({ packs }) => {
      for (const pack of packs) {
        _packCache.set(pack.key, pack);
      }
    })
    .catch(() => {
      // network failure — cache stays empty; fallback to free-text mode
    });
  return _cachePromise;
}

export function usePackSchema(workflowPackKey: string): UsePackSchemaResult {
  const [schema, setSchema] = useState<PackInputSchema | null>(null);
  const [packName, setPackName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (!workflowPackKey) {
      setSchema(null);
      setPackName("");
      return;
    }

    lastKey.current = workflowPackKey;

    // Serve from cache immediately if available
    const cached = _packCache.get(workflowPackKey);
    if (cached) {
      setSchema(normalizePackInputSchema(cached.input_schema));
      setPackName(cached.name);
      setLoading(false);
      return;
    }

    // Otherwise warm the cache then resolve
    setLoading(true);
    warmCache().then(() => {
      if (lastKey.current !== workflowPackKey) return; // stale update
      const pack = _packCache.get(workflowPackKey);
      if (pack) {
        setSchema(normalizePackInputSchema(pack.input_schema));
        setPackName(pack.name);
      } else {
        setSchema(null);
        setPackName(workflowPackKey);
      }
      setLoading(false);
    });
  }, [workflowPackKey]);

  return { schema, packName, loading };
}

/** Exposed for tests — resets the module-level cache. */
export function __resetPackCacheForTests(): void {
  _packCache.clear();
  _cachePromise = null;
}
