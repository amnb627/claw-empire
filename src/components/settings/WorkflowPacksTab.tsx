import { useCallback, useEffect, useState } from "react";
import * as api from "../../api";
import type { WorkflowPackConfig, PackAnalytics } from "../../api";
import type { TFunction } from "./types";

const BUILTIN_PACK_KEYS = new Set([
  "development",
  "novel",
  "report",
  "video_preprod",
  "web_research_report",
  "roleplay",
]);

const PACK_ICONS: Record<string, string> = {
  development: "💻",
  novel: "📖",
  report: "📄",
  video_preprod: "🎬",
  web_research_report: "🔍",
  roleplay: "🎭",
};

function isBuiltin(key: string): boolean {
  return BUILTIN_PACK_KEYS.has(key);
}

// --- Toggle Switch ---
function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-blue-500" : "bg-slate-600"
      }`}
    >
      <div
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

// --- Pack Form ---
type PackFormState = {
  key: string;
  name: string;
  enabled: boolean;
  routingKeywords: string; // comma-separated
  maxRounds: string;
  maxInputTokens: string;
  systemPrompt: string;
};

function defaultForm(): PackFormState {
  return {
    key: "",
    name: "",
    enabled: true,
    routingKeywords: "",
    maxRounds: "3",
    maxInputTokens: "12000",
    systemPrompt: "",
  };
}

function packToForm(pack: WorkflowPackConfig): PackFormState {
  const keywords = Array.isArray(pack.routing_keywords)
    ? (pack.routing_keywords as string[]).join(", ")
    : typeof pack.routing_keywords === "string"
      ? pack.routing_keywords
      : "";
  const cp = pack.cost_profile as Record<string, unknown> | null | undefined;
  const pp = pack.prompt_preset as Record<string, unknown> | null | undefined;
  return {
    key: pack.key,
    name: pack.name,
    enabled: pack.enabled,
    routingKeywords: keywords,
    maxRounds: cp?.maxRounds != null ? String(cp.maxRounds) : "3",
    maxInputTokens: cp?.maxInputTokens != null ? String(cp.maxInputTokens) : "12000",
    systemPrompt: typeof pp?.systemPrompt === "string" ? pp.systemPrompt : "",
  };
}

interface PackFormProps {
  t: TFunction;
  isEdit: boolean;
  editKey: string | null;
  form: PackFormState;
  setForm: (f: PackFormState) => void;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  onCancel: () => void;
}

function PackForm({ t, isEdit, editKey, form, setForm, saving, saveError, onSave, onCancel }: PackFormProps) {
  const inputCls =
    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors";
  const inputStyle = {
    background: "var(--th-input-bg)",
    borderColor: "var(--th-input-border)",
    color: "var(--th-text-primary)",
  };
  const labelCls = "block text-xs mb-1";
  const labelStyle = { color: "var(--th-text-secondary)" };

  const keyInvalid = form.key.length > 0 && !/^[a-z][a-z0-9_]*$/.test(form.key);

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
        {isEdit
          ? t({ ko: "팩 편집", en: "Edit Pack", ja: "パック編集", zh: "编辑包" })
          : t({ ko: "새 팩 만들기", en: "New Pack", ja: "新規パック作成", zh: "新建包" })}
        {isEdit && editKey && (
          <span className="ml-2 text-xs font-normal" style={{ color: "var(--th-text-secondary)" }}>
            ({editKey})
          </span>
        )}
      </h3>

      {/* Key — only shown when creating */}
      {!isEdit && (
        <div>
          <label className={labelCls} style={labelStyle}>
            {t({ ko: "팩 키 *", en: "Pack Key *", ja: "パックキー *", zh: "包键 *" })}
          </label>
          <input
            type="text"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
            placeholder="e.g. facility_visit"
            className={inputCls}
            style={{ ...inputStyle, borderColor: keyInvalid ? "var(--th-danger, #f87171)" : inputStyle.borderColor }}
          />
          {keyInvalid && (
            <p className="mt-1 text-xs text-red-400">
              {t({
                ko: "소문자, 숫자, 밑줄만 허용됩니다. 소문자로 시작해야 합니다.",
                en: "Only lowercase letters, digits, underscores. Must start with a letter.",
                ja: "小文字・数字・アンダースコアのみ。英字始まり。",
                zh: "仅允许小写字母、数字、下划线，且须以字母开头。",
              })}
            </p>
          )}
        </div>
      )}

      {/* Name */}
      <div>
        <label className={labelCls} style={labelStyle}>
          {t({ ko: "팩 이름 *", en: "Pack Name *", ja: "パック名 *", zh: "包名称 *" })}
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t({
            ko: "예: 시설 방문 준비",
            en: "e.g. Facility Visit Prep",
            ja: "例: 施設訪問準備",
            zh: "例如：设施访问准备",
          })}
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {/* Enabled */}
      <div className="flex items-center gap-3">
        <ToggleSwitch
          checked={form.enabled}
          onChange={(v) => setForm({ ...form, enabled: v })}
          label={t({ ko: "활성화", en: "Enabled", ja: "有効", zh: "启用" })}
        />
        <span className="text-sm" style={{ color: "var(--th-text-secondary)" }}>
          {t({ ko: "활성화", en: "Enabled", ja: "有効", zh: "启用" })}
        </span>
      </div>

      {/* Routing Keywords */}
      <div>
        <label className={labelCls} style={labelStyle}>
          {t({ ko: "라우팅 키워드", en: "Routing Keywords", ja: "ルーティングキーワード", zh: "路由关键词" })}
        </label>
        <input
          type="text"
          value={form.routingKeywords}
          onChange={(e) => setForm({ ...form, routingKeywords: e.target.value })}
          placeholder={t({ ko: "쉼표로 구분", en: "Comma-separated", ja: "カンマ区切り", zh: "逗号分隔" })}
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {/* Cost Profile */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} style={labelStyle}>
            {t({ ko: "최대 라운드", en: "Max Rounds", ja: "最大ラウンド数", zh: "最大轮次" })}
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={form.maxRounds}
            onChange={(e) => setForm({ ...form, maxRounds: e.target.value })}
            className={inputCls}
            style={inputStyle}
          />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>
            {t({ ko: "최대 입력 토큰", en: "Max Input Tokens", ja: "最大入力トークン", zh: "最大输入令牌" })}
          </label>
          <input
            type="number"
            min={1000}
            max={200000}
            value={form.maxInputTokens}
            onChange={(e) => setForm({ ...form, maxInputTokens: e.target.value })}
            className={inputCls}
            style={inputStyle}
          />
        </div>
      </div>

      {/* System Prompt */}
      <div>
        <label className={labelCls} style={labelStyle}>
          {t({ ko: "시스템 프롬프트", en: "System Prompt", ja: "システムプロンプト", zh: "系统提示" })}
        </label>
        <textarea
          rows={4}
          value={form.systemPrompt}
          onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          placeholder={t({
            ko: "프롬프트 템플릿. {{field_key}} 보간 지원.",
            en: "Prompt template. Supports {{field_key}} interpolation.",
            ja: "プロンプトテンプレート。{{field_key}} 補間対応。",
            zh: "提示模板，支持 {{field_key}} 插值。",
          })}
          className={`${inputCls} resize-y`}
          style={inputStyle}
        />
      </div>

      {saveError && (
        <p className="text-sm text-red-400" role="alert">
          {saveError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            background: "var(--th-input-bg)",
            color: "var(--th-text-secondary)",
            border: "1px solid var(--th-card-border)",
          }}
        >
          {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !form.name.trim() || (!isEdit && !form.key.trim())}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
        >
          {saving
            ? t({ ko: "저장 중...", en: "Saving...", ja: "保存中...", zh: "保存中..." })
            : t({ ko: "저장", en: "Save", ja: "保存", zh: "保存" })}
        </button>
      </div>
    </div>
  );
}

// --- Analytics Panel ---
const PERIOD_OPTIONS = [7, 30, 90] as const;
type PeriodDays = (typeof PERIOD_OPTIONS)[number];

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function statusIcon(status: string): string {
  if (status === "done") return "✅";
  if (status === "cancelled") return "❌";
  if (status === "review") return "🔍";
  if (status === "in_progress") return "⚙️";
  return "⏳";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

interface PackAnalyticsPanelProps {
  packKey: string;
  t: TFunction;
}

function PackAnalyticsPanel({ packKey, t }: PackAnalyticsPanelProps) {
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [analytics, setAnalytics] = useState<PackAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getPackAnalytics(packKey, period)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [packKey, period]);

  return (
    <div
      className="mt-2 rounded-lg p-4 text-xs space-y-3"
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
      data-testid="analytics-panel"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
          {t({ ko: "성능 분석", en: "Performance Analytics", ja: "パフォーマンス分析", zh: "性能分析" })}
        </span>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPeriod(d)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                period === d ? "bg-blue-600 text-white" : ""
              }`}
              style={
                period !== d
                  ? {
                      background: "var(--th-input-bg)",
                      color: "var(--th-text-secondary)",
                      border: "1px solid var(--th-card-border)",
                    }
                  : {}
              }
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p style={{ color: "var(--th-text-secondary)" }}>
          {t({ ko: "로딩 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中..." })}
        </p>
      )}
      {error && (
        <p className="text-red-400" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && analytics && (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-4 gap-2">
            {[
              {
                label: t({ ko: "작업", en: "Tasks", ja: "タスク", zh: "任务" }),
                value: String(analytics.total),
              },
              {
                label: t({ ko: "완료", en: "Done", ja: "完了", zh: "完成" }),
                value: String(analytics.completed),
              },
              {
                label: t({ ko: "첫 통과", en: "First-pass", ja: "初回合格", zh: "首次通过" }),
                value:
                  analytics.first_pass_rate !== null
                    ? `${analytics.first_pass} (${analytics.first_pass_rate}%)`
                    : String(analytics.first_pass),
              },
              {
                label: t({ ko: "평균 시간", en: "Avg time", ja: "平均時間", zh: "平均时间" }),
                value: analytics.avg_completion_ms !== null ? formatDuration(analytics.avg_completion_ms) : "—",
              },
            ].map(({ label, value }) => (
              <div key={label} className="rounded p-2 text-center" style={{ background: "var(--th-input-bg)" }}>
                <div className="font-semibold" style={{ color: "var(--th-text-primary)" }}>
                  {value}
                </div>
                <div style={{ color: "var(--th-text-muted, #94a3b8)" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Top revision reasons */}
          {analytics.top_revision_reasons.length > 0 && (
            <div>
              <div className="mb-1 font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {t({ ko: "주요 재작업 사유", en: "Top issues", ja: "主な修正理由", zh: "主要问题" })}
              </div>
              <ul className="space-y-0.5">
                {analytics.top_revision_reasons.map((r) => (
                  <li key={r.normalized_note} style={{ color: "var(--th-text-secondary)" }}>
                    <span className="text-orange-400 font-medium">×{r.count}</span> {r.normalized_note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recent tasks */}
          {analytics.recent_tasks.length > 0 && (
            <div>
              <div className="mb-1 font-medium" style={{ color: "var(--th-text-secondary)" }}>
                {t({ ko: "최근 작업", en: "Recent", ja: "最近のタスク", zh: "最近任务" })}
              </div>
              <ul className="space-y-0.5">
                {analytics.recent_tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center gap-1 truncate"
                    style={{ color: "var(--th-text-secondary)" }}
                  >
                    <span>{statusIcon(task.status)}</span>
                    <span className="flex-1 truncate">{task.title}</span>
                    <span style={{ color: "var(--th-text-muted, #94a3b8)" }}>{timeAgo(task.created_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analytics.total === 0 && (
            <p style={{ color: "var(--th-text-muted, #94a3b8)" }}>
              {t({
                ko: "이 기간에 작업 없음.",
                en: "No tasks in this period.",
                ja: "この期間にタスクなし。",
                zh: "该期间无任务。",
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// --- Pack Row ---
interface PackRowProps {
  pack: WorkflowPackConfig;
  toggling: boolean;
  onToggle: (pack: WorkflowPackConfig) => void;
  onEdit: (pack: WorkflowPackConfig) => void;
  onDelete: (pack: WorkflowPackConfig) => void;
  t: TFunction;
}

function PackRow({ pack, toggling, onToggle, onEdit, onDelete, t }: PackRowProps) {
  const icon = PACK_ICONS[pack.key] ?? "📦";
  const builtin = isBuiltin(pack.key);
  const [showAnalytics, setShowAnalytics] = useState(false);

  return (
    <div
      className={`rounded-lg transition-opacity ${!pack.enabled ? "opacity-60" : ""}`}
      style={{ background: "var(--th-input-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl select-none" aria-hidden="true">
          {icon}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate" style={{ color: "var(--th-text-primary)" }}>
              {pack.name}
            </span>
            {builtin && (
              <span
                className="text-xs px-1.5 py-0.5 rounded font-medium"
                style={{ background: "var(--th-accent-bg, rgba(59,130,246,0.15))", color: "var(--th-accent, #60a5fa)" }}
              >
                {t({ ko: "내장", en: "Built-in", ja: "組込み", zh: "内置" })}
              </span>
            )}
          </div>
          <span className="text-xs" style={{ color: "var(--th-text-muted, #94a3b8)" }}>
            {pack.key}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAnalytics((v) => !v)}
            aria-label={`${t({ ko: "통계", en: "Stats", ja: "統計", zh: "统计" })} ${pack.name}`}
            aria-expanded={showAnalytics}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: showAnalytics ? "var(--th-accent-bg, rgba(59,130,246,0.15))" : "var(--th-input-bg)",
              color: showAnalytics ? "var(--th-accent, #60a5fa)" : "var(--th-text-secondary)",
              border: "1px solid var(--th-card-border)",
            }}
          >
            📊 {t({ ko: "통계", en: "Stats", ja: "統計", zh: "统计" })}
          </button>

          <ToggleSwitch
            checked={pack.enabled}
            onChange={() => onToggle(pack)}
            disabled={toggling}
            label={`${t({ ko: "활성화", en: "Enable", ja: "有効", zh: "启用" })} ${pack.name}`}
          />

          <button
            type="button"
            onClick={() => onEdit(pack)}
            aria-label={`${t({ ko: "편집", en: "Edit", ja: "編集", zh: "编辑" })} ${pack.name}`}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: "var(--th-input-bg)",
              color: "var(--th-text-secondary)",
              border: "1px solid var(--th-card-border)",
            }}
          >
            {t({ ko: "편집", en: "Edit", ja: "編集", zh: "编辑" })}
          </button>

          {!builtin && (
            <button
              type="button"
              onClick={() => onDelete(pack)}
              aria-label={`${t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除" })} ${pack.name}`}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: "var(--th-danger-bg, rgba(248,113,113,0.12))",
                color: "var(--th-danger, #f87171)",
                border: "1px solid var(--th-danger-border, rgba(248,113,113,0.25))",
              }}
            >
              {t({ ko: "삭제", en: "Delete", ja: "削除", zh: "삭제" })}
            </button>
          )}
        </div>
      </div>

      {showAnalytics && (
        <div className="px-4 pb-4">
          <PackAnalyticsPanel packKey={pack.key} t={t} />
        </div>
      )}
    </div>
  );
}

// --- Main Tab ---
interface WorkflowPacksTabProps {
  t: TFunction;
}

export default function WorkflowPacksTab({ t }: WorkflowPacksTabProps) {
  const [packs, setPacks] = useState<WorkflowPackConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null); // null = creating new
  const [form, setForm] = useState<PackFormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  // ---- Load ----
  const loadPacks = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.getWorkflowPacks();
      setPacks(result.packs);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPacks();
  }, [loadPacks]);

  // ---- Toggle ----
  const handleToggle = useCallback(async (pack: WorkflowPackConfig) => {
    setTogglingKey(pack.key);
    try {
      await api.updateWorkflowPack(pack.key, { enabled: !pack.enabled });
      setPacks((prev) => prev.map((p) => (p.key === pack.key ? { ...p, enabled: !pack.enabled } : p)));
    } catch (err) {
      console.error("Toggle failed:", err);
    } finally {
      setTogglingKey(null);
    }
  }, []);

  // ---- Open form ----
  const handleNewPack = useCallback(() => {
    setEditKey(null);
    setForm(defaultForm());
    setSaveError(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((pack: WorkflowPackConfig) => {
    setEditKey(pack.key);
    setForm(packToForm(pack));
    setSaveError(null);
    setShowForm(true);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditKey(null);
    setSaveError(null);
  }, []);

  // ---- Save ----
  const handleSave = useCallback(async () => {
    setSaveError(null);
    if (!form.name.trim()) {
      setSaveError(
        t({ ko: "이름은 필수입니다.", en: "Name is required.", ja: "名前は必須です。", zh: "名称为必填项。" }),
      );
      return;
    }
    if (!editKey && !form.key.trim()) {
      setSaveError(t({ ko: "키는 필수입니다.", en: "Key is required.", ja: "キーは必須です。", zh: "键为必填项。" }));
      return;
    }
    if (!editKey && !/^[a-z][a-z0-9_]*$/.test(form.key)) {
      setSaveError(
        t({
          ko: "유효하지 않은 팩 키.",
          en: "Invalid pack key format.",
          ja: "パックキーの形式が無効です。",
          zh: "包键格式无效。",
        }),
      );
      return;
    }

    const keywords = form.routingKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const maxRoundsNum = Math.max(1, parseInt(form.maxRounds, 10) || 3);
    const maxInputTokensNum = Math.max(1000, parseInt(form.maxInputTokens, 10) || 12000);

    const payload = {
      name: form.name.trim(),
      enabled: form.enabled,
      routing_keywords: keywords,
      cost_profile: {
        maxRounds: maxRoundsNum,
        maxInputTokens: maxInputTokensNum,
      },
      prompt_preset: {
        systemPrompt: form.systemPrompt.trim() || undefined,
      },
    };

    setSaving(true);
    try {
      if (editKey) {
        const result = await api.updateWorkflowPack(editKey, payload);
        setPacks((prev) => prev.map((p) => (p.key === editKey ? result.pack : p)));
      } else {
        const result = await api.createWorkflowPack({ key: form.key.trim(), ...payload });
        setPacks((prev) => [...prev, result.pack]);
      }
      setShowForm(false);
      setEditKey(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [editKey, form, t]);

  // ---- Delete ----
  const handleDelete = useCallback(
    async (pack: WorkflowPackConfig) => {
      if (isBuiltin(pack.key)) return;
      const confirmed = window.confirm(
        t({
          ko: `'${pack.name}' 팩을 삭제하시겠습니까?`,
          en: `Delete pack '${pack.name}'?`,
          ja: `パック '${pack.name}' を削除しますか？`,
          zh: `删除包 '${pack.name}'？`,
        }),
      );
      if (!confirmed) return;
      try {
        await api.deleteWorkflowPack(pack.key);
        setPacks((prev) => prev.filter((p) => p.key !== pack.key));
        if (editKey === pack.key) {
          setShowForm(false);
          setEditKey(null);
        }
      } catch (err) {
        console.error("Delete failed:", err);
      }
    },
    [editKey, t],
  );

  if (loading) {
    return (
      <div className="text-center py-12" style={{ color: "var(--th-text-secondary)" }}>
        <span className="text-2xl">⏳</span>
        <p className="mt-2 text-sm">
          {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中..." })}
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="rounded-xl p-5 text-center"
        style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
      >
        <p className="text-sm text-red-400" role="alert">
          {t({ ko: "오류:", en: "Error:", ja: "エラー:", zh: "错误：" })} {loadError}
        </p>
        <button
          type="button"
          onClick={() => void loadPacks()}
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
        >
          {t({ ko: "다시 시도", en: "Retry", ja: "再試行", zh: "重试" })}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text-primary)" }}>
          {t({ ko: "워크플로우 팩", en: "Workflow Packs", ja: "ワークフローパック", zh: "工作流包" })}
          <span className="ml-2 font-normal normal-case" style={{ color: "var(--th-text-secondary)" }}>
            ({packs.length})
          </span>
        </h3>
        {!showForm && (
          <button
            type="button"
            onClick={handleNewPack}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            + {t({ ko: "새 팩", en: "New Pack", ja: "新規パック", zh: "新建包" })}
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <PackForm
          t={t}
          isEdit={editKey !== null}
          editKey={editKey}
          form={form}
          setForm={setForm}
          saving={saving}
          saveError={saveError}
          onSave={() => void handleSave()}
          onCancel={handleCancel}
        />
      )}

      {/* Pack list */}
      <div className="space-y-2">
        {packs.length === 0 && (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
          >
            <p className="text-sm" style={{ color: "var(--th-text-secondary)" }}>
              {t({ ko: "팩 없음.", en: "No packs found.", ja: "パックなし。", zh: "暂无包。" })}
            </p>
          </div>
        )}
        {packs.map((pack) => (
          <PackRow
            key={pack.key}
            pack={pack}
            toggling={togglingKey === pack.key}
            onToggle={(p) => void handleToggle(p)}
            onEdit={handleEdit}
            onDelete={(p) => void handleDelete(p)}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
