import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDirectAsyncReader } from "./async-reader.ts";

// ─── helpers ────────────────────────────────────────────────────────────────

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO items (name, value) VALUES ('alpha', 10), ('beta', 20), ('gamma', 30);
  `);
  return db;
}

// ─── createDirectAsyncReader ─────────────────────────────────────────────────

describe("createDirectAsyncReader", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("resolves with all rows when no params", async () => {
    const reader = createDirectAsyncReader(db);
    const rows = await reader.query<{ id: number; name: string; value: number }>(
      "SELECT * FROM items ORDER BY id ASC",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ name: "alpha", value: 10 });
    expect(rows[2]).toMatchObject({ name: "gamma", value: 30 });
  });

  it("resolves with filtered rows when params provided", async () => {
    const reader = createDirectAsyncReader(db);
    const rows = await reader.query<{ name: string }>(
      "SELECT name FROM items WHERE value > ?",
      [15],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toEqual(["beta", "gamma"]);
  });

  it("returns empty array when query matches nothing", async () => {
    const reader = createDirectAsyncReader(db);
    const rows = await reader.query("SELECT * FROM items WHERE value > ?", [999]);
    expect(rows).toHaveLength(0);
  });

  it("rejects on invalid SQL", async () => {
    const reader = createDirectAsyncReader(db);
    await expect(reader.query("SELECT * FROM nonexistent_table")).rejects.toThrow();
  });

  it("returns empty array when fewer params than placeholders (SQLite binds NULL)", async () => {
    // SQLite substitutes NULL for missing bound parameters rather than throwing.
    // An item with name = NULL does not exist, so the result is empty.
    const reader = createDirectAsyncReader(db);
    const rows = await reader.query("SELECT * FROM items WHERE value = ? AND name = ?", [10]);
    // SQLite binds name = NULL → no row matches → empty result (no throw)
    expect(rows).toHaveLength(0);
  });

  it("returns typed rows (generic type parameter)", async () => {
    const reader = createDirectAsyncReader(db);
    type Item = { id: number; name: string; value: number };
    const rows = await reader.query<Item>("SELECT * FROM items WHERE id = ?", [1]);
    expect(rows).toHaveLength(1);
    // TypeScript type is validated at compile time; runtime check:
    expect(typeof rows[0].id).toBe("number");
    expect(typeof rows[0].name).toBe("string");
  });

  it("close() resolves without error", async () => {
    const reader = createDirectAsyncReader(db);
    await expect(reader.close()).resolves.toBeUndefined();
  });

  it("handles multiple concurrent queries correctly", async () => {
    const reader = createDirectAsyncReader(db);
    const [r1, r2, r3] = await Promise.all([
      reader.query<{ name: string }>("SELECT name FROM items WHERE id = ?", [1]),
      reader.query<{ name: string }>("SELECT name FROM items WHERE id = ?", [2]),
      reader.query<{ name: string }>("SELECT name FROM items WHERE id = ?", [3]),
    ]);
    expect(r1[0].name).toBe("alpha");
    expect(r2[0].name).toBe("beta");
    expect(r3[0].name).toBe("gamma");
  });

  it("defaults to empty params array when params omitted", async () => {
    const reader = createDirectAsyncReader(db);
    const rows = await reader.query("SELECT COUNT(*) AS cnt FROM items");
    expect((rows[0] as { cnt: number }).cnt).toBe(3);
  });
});
