import { useState } from "react";
import type { PackInputSchema } from "../../../utils/packPrompt";
import type { TFunction } from "../constants";

interface PackSchemaFieldsProps {
  schema: PackInputSchema;
  packName: string;
  fieldValues: Record<string, string>;
  notes: string;
  previewExpanded: boolean;
  assembledPrompt: string;
  t: TFunction;
  onFieldChange: (key: string, value: string) => void;
  onNotesChange: (value: string) => void;
  onTogglePreview: () => void;
}

function fieldLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Renders dynamic input fields driven by a pack's inputSchema.
 * All fields are text inputs for now; the type-switch below makes it trivial
 * to extend with date / file_path / select types.
 */
function renderField(
  key: string,
  required: boolean,
  value: string,
  onChange: (value: string) => void,
): React.ReactNode {
  // Type-switch extension point: check key suffix or a future `type` annotation
  // e.g. if (key.endsWith('_date')) return <input type="date" ... />;
  // For now: all fields are plain text inputs.
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={
        required ? `Enter ${fieldLabel(key).toLowerCase()}...` : `(optional) ${fieldLabel(key).toLowerCase()}`
      }
      data-testid={`pack-field-${key}`}
      className={`w-full rounded-lg border px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-1 ${
        required
          ? "border-blue-600/60 bg-slate-800 focus:border-blue-400 focus:ring-blue-400"
          : "border-slate-700 bg-slate-800/70 focus:border-slate-500 focus:ring-slate-500"
      }`}
    />
  );
}

export default function PackSchemaFields({
  schema,
  packName,
  fieldValues,
  notes,
  previewExpanded,
  assembledPrompt,
  t,
  onFieldChange,
  onNotesChange,
  onTogglePreview,
}: PackSchemaFieldsProps) {
  const [optionalExpanded, setOptionalExpanded] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-blue-700/30 px-2 py-0.5 text-xs font-semibold text-blue-300">{packName}</span>
        <span className="text-xs text-slate-500">
          {t({
            ko: "팩 기반 입력 폼",
            en: "Pack-driven input form",
            ja: "パック入力フォーム",
            zh: "工作包输入表单",
          })}
        </span>
      </div>

      {/* Required fields */}
      {schema.required.length > 0 && (
        <div className="space-y-2">
          {schema.required.map((key) => (
            <div key={key}>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-300">
                {fieldLabel(key)}
                <span className="text-red-400" title={t({ ko: "필수", en: "Required", ja: "必須", zh: "必填" })}>
                  *
                </span>
              </label>
              {renderField(key, true, fieldValues[key] ?? "", (v) => onFieldChange(key, v))}
            </div>
          ))}
        </div>
      )}

      {/* Optional fields — collapsible */}
      {schema.optional.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOptionalExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-200"
          >
            <span>{optionalExpanded ? "▾" : "▸"}</span>
            <span>
              {t({
                ko: `선택 항목 (${schema.optional.length})`,
                en: `Optional fields (${schema.optional.length})`,
                ja: `任意項目 (${schema.optional.length})`,
                zh: `可选项目 (${schema.optional.length})`,
              })}
            </span>
          </button>
          {optionalExpanded && (
            <div className="mt-2 space-y-2 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
              {schema.optional.map((key) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-slate-400">{fieldLabel(key)}</label>
                  {renderField(key, false, fieldValues[key] ?? "", (v) => onFieldChange(key, v))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Additional notes */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">
          {t({
            ko: "추가 메모",
            en: "Additional Notes",
            ja: "追加メモ",
            zh: "附加备注",
          })}
        </label>
        <textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          rows={2}
          placeholder={t({
            ko: "추가 참고 사항을 입력하세요...",
            en: "Any extra context or notes...",
            ja: "追加のメモを入力してください...",
            zh: "输入额外的说明...",
          })}
          data-testid="pack-notes"
          className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
        />
      </div>

      {/* Live preview — collapsible */}
      <div>
        <button
          type="button"
          onClick={onTogglePreview}
          className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-200"
        >
          <span>{previewExpanded ? "▾" : "▸"}</span>
          <span>
            {t({
              ko: "프롬프트 미리보기",
              en: "Prompt Preview",
              ja: "プロンプトプレビュー",
              zh: "提示预览",
            })}
          </span>
        </button>
        {previewExpanded && (
          <pre
            data-testid="pack-prompt-preview"
            className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300"
          >
            {assembledPrompt}
          </pre>
        )}
      </div>
    </div>
  );
}
