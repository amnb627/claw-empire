import { WebSocket } from "ws";

// Per-task rate limit for cli_output events: max ~30 events/sec per task.
// This prevents WebSocket event flood when 5+ agents stream concurrently.
// Rate limiter is the outer gate; existing dedup logic is the inner gate.
const CLI_OUTPUT_MIN_INTERVAL_MS = 33; // ~30 events/sec max per task
const cliOutputLastBroadcast = new Map<string, number>();

function shouldBroadcastCliOutput(taskId: string, nowMs: () => number): boolean {
  const now = nowMs();
  const last = cliOutputLastBroadcast.get(taskId) ?? 0;
  if (now - last < CLI_OUTPUT_MIN_INTERVAL_MS) return false;
  cliOutputLastBroadcast.set(taskId, now);
  return true;
}

export function deleteCliOutputRateState(taskId: string): void {
  cliOutputLastBroadcast.delete(taskId);
}

export function createWsHub(nowMs: () => number): {
  wsClients: Set<WebSocket>;
  broadcast: (type: string, payload: unknown) => void;
} {
  const wsClients = new Set<WebSocket>();

  function sendRaw(type: string, payload: unknown): void {
    const message = JSON.stringify({ type, payload, ts: nowMs() });
    for (const ws of wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  // Batched broadcast for high-frequency streaming event types.
  // Collects payloads during a cooldown window, then flushes them all.
  // Only truly high-frequency types are batched; agent_status is excluded
  // because it is paired with task_update (unbatched) and delaying it
  // causes visible ordering mismatches on the frontend.
  const BATCH_INTERVAL: Record<string, number> = {
    cli_output: 250, // highest frequency (process stdout/stderr streams)
    subtask_update: 150, // moderate frequency
  };
  const MAX_BATCH_QUEUE = 60;
  const batches = new Map<string, { queue: unknown[]; timer: ReturnType<typeof setTimeout> }>();

  function broadcast(type: string, payload: unknown): void {
    // Per-task rate limiting for cli_output: outer gate checked before dedup/batch.
    // Only applies to cli_output; task_update, agent_status etc. are always delivered.
    if (type === "cli_output") {
      const taskId =
        payload !== null && typeof payload === "object" && "task_id" in payload
          ? String((payload as Record<string, unknown>).task_id ?? "")
          : "";
      if (taskId && !shouldBroadcastCliOutput(taskId, nowMs)) return;
    }

    const interval = BATCH_INTERVAL[type];
    if (!interval) {
      sendRaw(type, payload);
      return;
    }

    const existing = batches.get(type);
    if (existing) {
      if (existing.queue.length < MAX_BATCH_QUEUE) {
        existing.queue.push(payload);
      }
      // Over cap: shed oldest to prevent unbounded growth
      else {
        existing.queue.shift();
        existing.queue.push(payload);
      }
      return;
    }

    // First event: send immediately, then open a batch window
    sendRaw(type, payload);
    const entry: { queue: unknown[]; timer: ReturnType<typeof setTimeout> } = {
      queue: [],
      timer: setTimeout(() => {
        const items = entry.queue;
        batches.delete(type);
        for (const p of items) {
          try {
            sendRaw(type, p);
          } catch {
            /* skip failed item, continue flushing */
          }
        }
      }, interval),
    };
    batches.set(type, entry);
  }

  return { wsClients, broadcast };
}
