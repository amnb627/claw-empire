import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createWsHub, deleteCliOutputRateState } from "./hub.ts";

type MockWs = {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
};

function parseMessage(raw: string): { type: string; payload: unknown; ts: number } {
  return JSON.parse(raw) as { type: string; payload: unknown; ts: number };
}

describe("createWsHub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("일반 이벤트는 즉시 broadcast한다", () => {
    const hub = createWsHub(() => 1000);
    const wsOpen: MockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
    };
    const wsClosed: MockWs = {
      readyState: WebSocket.CLOSED,
      send: vi.fn(),
    };

    hub.wsClients.add(wsOpen as unknown as WebSocket);
    hub.wsClients.add(wsClosed as unknown as WebSocket);

    hub.broadcast("task_update", { id: "t-1" });

    expect(wsOpen.send).toHaveBeenCalledTimes(1);
    expect(wsClosed.send).not.toHaveBeenCalled();
    const envelope = parseMessage(String(wsOpen.send.mock.calls[0]?.[0]));
    expect(envelope).toMatchObject({
      type: "task_update",
      payload: { id: "t-1" },
      ts: 1000,
    });
  });

  it("cli_output은 첫 이벤트 즉시 전송 후 batch window에서 flush한다", async () => {
    const hub = createWsHub(() => 2000);
    const wsOpen: MockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
    };
    hub.wsClients.add(wsOpen as unknown as WebSocket);

    hub.broadcast("cli_output", { seq: 1 });
    hub.broadcast("cli_output", { seq: 2 });
    hub.broadcast("cli_output", { seq: 3 });

    expect(wsOpen.send).toHaveBeenCalledTimes(1);
    expect(parseMessage(String(wsOpen.send.mock.calls[0]?.[0])).payload).toEqual({ seq: 1 });

    await vi.advanceTimersByTimeAsync(260);

    expect(wsOpen.send).toHaveBeenCalledTimes(3);
    const payloads = wsOpen.send.mock.calls.map((call) => parseMessage(String(call[0])).payload);
    expect(payloads).toEqual([{ seq: 1 }, { seq: 2 }, { seq: 3 }]);
  });

  it("batch queue cap(60)을 넘으면 가장 오래된 항목부터 버린다", async () => {
    const hub = createWsHub(() => 3000);
    const wsOpen: MockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
    };
    hub.wsClients.add(wsOpen as unknown as WebSocket);

    hub.broadcast("cli_output", { seq: 0 });
    for (let i = 1; i <= 80; i += 1) {
      hub.broadcast("cli_output", { seq: i });
    }

    await vi.advanceTimersByTimeAsync(260);

    expect(wsOpen.send).toHaveBeenCalledTimes(61);
    const payloads = wsOpen.send.mock.calls.map((call) => parseMessage(String(call[0])).payload as { seq: number });
    const seqs = payloads.map((payload) => payload.seq);

    expect(seqs[0]).toBe(0);
    expect(seqs.includes(80)).toBe(true);
    expect(seqs.includes(1)).toBe(false);
    expect(seqs.includes(20)).toBe(false);
    expect(seqs.includes(21)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cli_output per-task rate limiter
// Uses fake timers to control both wall-clock (nowMs) and setTimeout.
// The rate limiter is the OUTER gate; events dropped by it never enter
// the batch queue. Events that pass the rate limiter may be held in the
// 250ms batch window, so tests flush with advanceTimersByTimeAsync(260).
// ---------------------------------------------------------------------------
describe("cli_output rate limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("33ms 이내에 같은 task_id로 호출하면 두 번째 이후는 rate-limit으로 차단한다", async () => {
    let now = 10_000;
    const hub = createWsHub(() => now);
    const wsOpen: MockWs = { readyState: WebSocket.OPEN, send: vi.fn() };
    hub.wsClients.add(wsOpen as unknown as WebSocket);

    // First call passes rate limiter and is sent immediately (first in batch window)
    hub.broadcast("cli_output", { task_id: "task-rl-block-1", data: "line1" });
    // Second call within 33ms — rate limiter drops it before it reaches the batch queue
    now += 10;
    hub.broadcast("cli_output", { task_id: "task-rl-block-1", data: "line2" });

    // Flush batch window to confirm no queued items from the rate-limited call
    await vi.advanceTimersByTimeAsync(260);

    // Only the first call was sent
    expect(wsOpen.send).toHaveBeenCalledTimes(1);
    expect(parseMessage(String(wsOpen.send.mock.calls[0]?.[0])).payload).toMatchObject({ data: "line1" });

    deleteCliOutputRateState("task-rl-block-1");
  });

  it("33ms 이상 경과 후에는 같은 task_id로 다시 전송할 수 있다", async () => {
    let now = 20_000;
    const hub = createWsHub(() => now);
    const wsOpen: MockWs = { readyState: WebSocket.OPEN, send: vi.fn() };
    hub.wsClients.add(wsOpen as unknown as WebSocket);

    // First call — passes rate limiter and batch window sends it immediately
    hub.broadcast("cli_output", { task_id: "task-rl-pass-2", data: "first" });
    // Flush first batch window
    await vi.advanceTimersByTimeAsync(260);
    expect(wsOpen.send).toHaveBeenCalledTimes(1);

    // Advance wall-clock past 33ms rate-limit threshold
    now += 40;
    // Second call — rate limiter passes (40ms > 33ms), new batch window opens, sends immediately
    hub.broadcast("cli_output", { task_id: "task-rl-pass-2", data: "second" });
    // Flush second batch window
    await vi.advanceTimersByTimeAsync(260);
    expect(wsOpen.send).toHaveBeenCalledTimes(2);

    deleteCliOutputRateState("task-rl-pass-2");
  });

  it("다른 task_id는 각자 독립적으로 rate-limit 상태를 관리한다", async () => {
    let now = 30_000;
    const hub = createWsHub(() => now);
    const wsOpen: MockWs = { readyState: WebSocket.OPEN, send: vi.fn() };
    hub.wsClients.add(wsOpen as unknown as WebSocket);

    // Two different tasks: first events each pass the rate limiter independently
    hub.broadcast("cli_output", { task_id: "task-ind-A", data: "a1" });
    now += 5;
    hub.broadcast("cli_output", { task_id: "task-ind-B", data: "b1" });
    await vi.advanceTimersByTimeAsync(260);
    // Both first events delivered
    expect(wsOpen.send).toHaveBeenCalledTimes(2);

    // Rapid second calls within rate-limit window for each — both are rate-limited
    now += 5; // total ~10ms from A's first call, ~5ms from B's first call
    hub.broadcast("cli_output", { task_id: "task-ind-A", data: "a2" });
    hub.broadcast("cli_output", { task_id: "task-ind-B", data: "b2" });
    await vi.advanceTimersByTimeAsync(260);
    // No new messages
    expect(wsOpen.send).toHaveBeenCalledTimes(2);

    deleteCliOutputRateState("task-ind-A");
    deleteCliOutputRateState("task-ind-B");
  });

  it("deleteCliOutputRateState 호출 후 해당 task_id는 맵에서 제거된다", async () => {
    let now = 40_000;
    const hub = createWsHub(() => now);
    const wsOpen: MockWs = { readyState: WebSocket.OPEN, send: vi.fn() };
    hub.wsClients.add(wsOpen as unknown as WebSocket);

    // First call registers the task in rate-limit map
    hub.broadcast("cli_output", { task_id: "task-cleanup-X", data: "x" });
    now += 10; // still within 33ms window
    // Second call — rate-limited (dropped)
    hub.broadcast("cli_output", { task_id: "task-cleanup-X", data: "y" });
    await vi.advanceTimersByTimeAsync(260);
    expect(wsOpen.send).toHaveBeenCalledTimes(1);

    // After deleteCliOutputRateState, task entry removed from map
    deleteCliOutputRateState("task-cleanup-X");
    now += 5; // only +5ms since first call but state was cleared — passes as fresh
    hub.broadcast("cli_output", { task_id: "task-cleanup-X", data: "z" });
    await vi.advanceTimersByTimeAsync(260);
    expect(wsOpen.send).toHaveBeenCalledTimes(2);

    deleteCliOutputRateState("task-cleanup-X");
  });

  it("task_update 같은 다른 이벤트 타입은 rate-limit 영향을 받지 않는다", () => {
    let now = 50_000;
    const hub = createWsHub(() => now);
    const wsOpen: MockWs = { readyState: WebSocket.OPEN, send: vi.fn() };
    hub.wsClients.add(wsOpen as unknown as WebSocket);

    // Rapid task_update events must always be delivered — no rate limiting on non-cli_output
    hub.broadcast("task_update", { task_id: "task-tu-Z", status: "in_progress" });
    now += 5;
    hub.broadcast("task_update", { task_id: "task-tu-Z", status: "done" });
    expect(wsOpen.send).toHaveBeenCalledTimes(2);
  });
});
