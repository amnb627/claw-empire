/**
 * db-worker.ts — Worker Thread entry point for AsyncReader.
 *
 * Each instance opens its own read-only DatabaseSync connection to the same
 * SQLite WAL file. Multiple readers can operate concurrently without blocking
 * the writer on the main thread.
 *
 * Message protocol:
 *   Incoming: { id: string; sql: string; params: unknown[] }
 *   Outgoing: { id: string; rows: unknown[] }   (success)
 *           | { id: string; error: string }      (failure)
 */

import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";

if (!parentPort) {
  throw new Error("db-worker must be run as a Worker Thread, not directly.");
}

const { dbPath } = workerData as { dbPath: string };

const db = new DatabaseSync(dbPath);

// WAL mode for non-blocking concurrent reads alongside the main-thread writer.
db.exec("PRAGMA journal_mode = WAL");

// A generous busy timeout so the worker doesn't error on write-locked pages.
db.exec("PRAGMA busy_timeout = 5000");

// Prevent any accidental writes from this connection — reads only.
db.exec("PRAGMA query_only = ON");

type QueryMessage = { id: string; sql: string; params: unknown[] };

parentPort.on("message", (msg: QueryMessage) => {
  try {
    const stmt = db.prepare(msg.sql);
    const rows = msg.params.length > 0 ? stmt.all(...(msg.params as any[])) : stmt.all();
    parentPort!.postMessage({ id: msg.id, rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    parentPort!.postMessage({ id: msg.id, error: message });
  }
});
