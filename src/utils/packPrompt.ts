export interface PackInputSchema {
  required: string[];
  optional: string[];
}

/**
 * Assembles a structured prompt from pack metadata and user-supplied field values.
 * All fields are rendered as text; the type-switch extension point is the
 * `renderField` parameter that callers can supply later.
 */
export function assemblePackPrompt(
  packName: string,
  inputSchema: PackInputSchema,
  fieldValues: Record<string, string>,
  notes?: string,
): string {
  const lines: string[] = [`## Task: ${packName}`, ""];

  const allFields = [
    ...inputSchema.required.map((f) => ({ key: f, required: true })),
    ...inputSchema.optional.map((f) => ({ key: f, required: false })),
  ];

  for (const { key, required } of allFields) {
    const value = fieldValues[key]?.trim();
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (value) {
      lines.push(`**${label}**: ${value}`);
    } else if (required) {
      lines.push(`**${label}**: [REQUIRED - not provided]`);
    }
  }

  if (notes?.trim()) {
    lines.push("", `**Additional Notes**: ${notes.trim()}`);
  }

  return lines.join("\n");
}

/**
 * Returns true when the schema has at least one field (required or optional).
 */
export function hasSchemaFields(schema: PackInputSchema | null | undefined): boolean {
  if (!schema) return false;
  return schema.required.length > 0 || schema.optional.length > 0;
}

/**
 * Normalises a raw API response value into a typed PackInputSchema.
 * Returns null when the value doesn't look like a valid schema.
 */
export function normalizePackInputSchema(raw: unknown): PackInputSchema | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const required = Array.isArray(r.required) ? r.required.filter((x): x is string => typeof x === "string") : [];
  const optional = Array.isArray(r.optional) ? r.optional.filter((x): x is string => typeof x === "string") : [];
  if (required.length === 0 && optional.length === 0) return null;
  return { required, optional };
}
