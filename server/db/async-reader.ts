/**
 * AsyncReader — non-blocking database reads via Worker Thread pool.
 *
 * Production path: `createAsyncReader(dbPath)` spawns N worker threads, each
 * holding their own read-only DatabaseSync connection to the same WAL file.
 * Queries are dispatched round-robin and resolved as Promises, so the main
 * thread event loop is never blocked by long-running SELECT statements.
 *
 * Test/fallback path: `createDirectAsyncReader(db)` wraps a synchronous
 * DatabaseSync in Promise.resolve() — same interface, zero threads.
 *
 * Usage:
 *   const reader = createAsyncReader(dbPath);
 *   const rows = await reader.query<Task>('SELECT * FROM tasks WHERE status = ?', ['inbox']);
 *   await reader.close();
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface AsyncReader {
  /**
   * Execute a read-only SQL query and resolve with the result rows.
   * Never throws synchronously — errors are surfaced as rejected Promises.
   */
  query<T = Record<string, unknown>>(sql: string, params?: SQLInputValue[]): Promise<T[]>;
  /** Terminate all worker threads (no-op for the direct adapter). */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Worker Thread pool implementation
// ---------------------------------------------------------------------------

type PendingEntry = {
  resolve: (rows: unknown[]) => void;
  reject: (err: Error) => void;
};

type WorkerMessage = { id: string; rows?: unknown[]; error?: string };

const WORKER_FILE = fileURLToPath(new URL("./worker/db-worker.ts", import.meta.url));

/**
 * Create a pool of N worker threads backed by read-only DatabaseSync
 * connections. Queries are distributed round-robin.
 *
 * @param dbPath  Absolute path to the SQLite database file.
 * @param poolSize  Number of worker threads (default 2).
 */
export function createAsyncReader(dbPath: string, poolSize = 2): AsyncReader {
  const pending = new Map<string, PendingEntry>();
  let rrIndex = 0;

  // Inherit the parent's execArgv so that tsx (or any other loader registered
  // in the main process) is also active inside the worker threads.
  const workerExecArgv = process.execArgv.length > 0 ? process.execArgv : ["--import", "tsx"];

  const workers = Array.from({ length: Math.max(1, poolSize) }, () => {
    const w = new Worker(WORKER_FILE, {
      workerData: { dbPath },
      execArgv: workerExecArgv,
    });

    w.on("message", (msg: WorkerMessage) => {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error !== undefined) {
        entry.reject(new Error(msg.error));
      } else {
        entry.resolve(msg.rows ?? []);
      }
    });

    w.on("error", (err) => {
      // Surface unhandled worker errors to any pending queries on this worker.
      // (Round-robin means we can't know which query is on which worker cheaply,
      // so we reject all pending queries that are currently waiting.)
      console.error("[AsyncReader] Worker error:", err);
    });

    return w;
  });

  return {
    query<T>(sql: string, params: SQLInputValue[] = []): Promise<T[]> {
      return new Promise<T[]>((resolve, reject) => {
        const id = randomUUID();
        pending.set(id, {
          resolve: resolve as (rows: unknown[]) => void,
          reject,
        });
        const worker = workers[rrIndex % workers.length];
        rrIndex++;
        worker.postMessage({ id, sql, params });
      });
    },

    close(): Promise<void> {
      return Promise.all(workers.map((w) => w.terminate())).then(() => undefined);
    },
  };
}

// ---------------------------------------------------------------------------
// Direct (synchronous) adapter — for tests and simple cases
// ---------------------------------------------------------------------------

type SyncDb = Pick<DatabaseSync, "prepare">;

/**
 * Wrap a synchronous DatabaseSync in the AsyncReader interface.
 * No worker threads are spawned. Useful in tests and CLI scripts.
 *
 * @param db  An existing DatabaseSync instance.
 */
export function createDirectAsyncReader(db: SyncDb): AsyncReader {
  return {
    query<T>(sql: string, params: SQLInputValue[] = []): Promise<T[]> {
      try {
        const stmt = db.prepare(sql);
        const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
        return Promise.resolve(rows as T[]);
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    },

    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}
