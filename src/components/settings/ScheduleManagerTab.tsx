import { useCallback, useEffect, useState } from "react";
import * as api from "../../api";
import type { TaskSchedule, TaskScheduleCreateInput } from "../../api";
import type { TFunction } from "./types";

function formatNextTrigger(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "Due now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(diff / 86_400_000);
  return `in ${days}d`;
}

type ScheduleFormState = {
  title_template: string;
  description_template: string;
  workflow_pack_key: string;
  interval_days: string;
  enabled: boolean;
};

function defaultForm(): ScheduleFormState {
  return {
    title_template: "",
    description_template: "",
    workflow_pack_key: "report",
    interval_days: "7",
    enabled: true,
  };
}

function scheduleToForm(s: TaskSchedule): ScheduleFormState {
  return {
    title_template: s.title_template,
    description_template: s.description_template ?? "",
    workflow_pack_key: s.workflow_pack_key,
    interval_days: String(s.interval_days),
    enabled: s.enabled,
  };
}

interface ScheduleFormProps {
  t: TFunction;
  isEdit: boolean;
  form: ScheduleFormState;
  setForm: (f: ScheduleFormState) => void;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  onCancel: () => void;
}

function ScheduleForm({ t, isEdit, form, setForm, saving, saveError, onSave, onCancel }: ScheduleFormProps) {
  const inputCls =
    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors";
  const inputStyle = {
    background: "var(--th-input-bg)",
    borderColor: "var(--th-input-border)",
    color: "var(--th-text-primary)",
  };
  const labelCls = "block text-xs mb-1";
  const labelStyle = { color: "var(--th-text-secondary)" };

  const intervalNum = parseInt(form.interval_days, 10);
  const intervalInvalid = !Number.isFinite(intervalNum) || intervalNum < 1;

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
        {isEdit
          ? t({ ko: "일정 편집", en: "Edit Schedule", ja: "スケジュール編集", zh: "编辑计划" })
          : t({ ko: "새 일정 만들기", en: "New Schedule", ja: "新規スケジュール作成", zh: "新建计划" })}
      </h3>

      <div>
        <label className={labelCls} style={labelStyle}>
          {t({ ko: "제목 템플릿 *", en: "Title Template *", ja: "タイトルテンプレート *", zh: "标题模板 *" })}
        </label>
        <input
          type="text"
          value={form.title_template}
          onChange={(e) => setForm({ ...form, title_template: e.target.value })}
          placeholder={t({
            ko: "예: ZK 감사 {{date}}",
            en: "e.g. ZK Audit {{date}}",
            ja: "例: ZK 監査 {{date}}",
            zh: "例如：ZK 审计 {{date}}",
          })}
          className={inputCls}
          style={inputStyle}
        />
        <p className="mt-0.5 text-xs" style={{ color: "var(--th-text-muted, #94a3b8)" }}>
          {t({ ko: "{{date}} 는 YYYY-MM-DD 로 치환됩니다.", en: "{{date}} will be replaced with YYYY-MM-DD.", ja: "{{date}} は YYYY-MM-DD に置換されます。", zh: "{{date}} 将替换为 YYYY-MM-DD。" })}
        </p>
      </div>

      <div>
        <label className={labelCls} style={labelStyle}>
          {t({ ko: "설명 템플릿", en: "Description Template", ja: "説明テンプレート", zh: "描述模板" })}
        </label>
        <textarea
          rows={2}
          value={form.description_template}
          onChange={(e) => setForm({ ...form, description_template: e.target.value })}
          className={`${inputCls} resize-y`}
          style={inputStyle}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} style={labelStyle}>
            {t({ ko: "워크플로우 팩", en: "Workflow Pack", ja: "ワークフローパック", zh: "工作流包" })}
          </label>
          <input
            type="text"
            value={form.workflow_pack_key}
            onChange={(e) => setForm({ ...form, workflow_pack_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
            placeholder="report"
            className={inputCls}
            style={inputStyle}
          />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>
            {t({ ko: "반복 간격 (일) *", en: "Interval (days) *", ja: "繰り返し間隔 (日) *", zh: "重复间隔（天）*" })}
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={form.interval_days}
            onChange={(e) => setForm({ ...form, interval_days: e.target.value })}
            className={inputCls}
            style={{
              ...inputStyle,
              borderColor: intervalInvalid && form.interval_days !== "" ? "var(--th-danger, #f87171)" : inputStyle.borderColor,
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={form.enabled}
          onClick={() => setForm({ ...form, enabled: !form.enabled })}
          className={`relative h-6 w-11 rounded-full transition-colors ${form.enabled ? "bg-blue-500" : "bg-slate-600"}`}
        >
          <div
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${form.enabled ? "left-[22px]" : "left-0.5"}`}
          />
        </button>
        <span className="text-sm" style={{ color: "var(--th-text-secondary)" }}>
          {t({ ko: "활성화", en: "Enabled", ja: "有効", zh: "启用" })}
        </span>
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
          style={{ background: "var(--th-input-bg)", color: "var(--th-text-secondary)", border: "1px solid var(--th-card-border)" }}
        >
          {t({ ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" })}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !form.title_template.trim() || intervalInvalid}
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

interface ScheduleManagerTabProps {
  t: TFunction;
}

export default function ScheduleManagerTab({ t }: ScheduleManagerTabProps) {
  const [schedules, setSchedules] = useState<TaskSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.getSchedules();
      setSchedules(result);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const handleNew = useCallback(() => {
    setEditId(null);
    setForm(defaultForm());
    setSaveError(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((s: TaskSchedule) => {
    setEditId(s.id);
    setForm(scheduleToForm(s));
    setSaveError(null);
    setShowForm(true);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditId(null);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    if (!form.title_template.trim()) {
      setSaveError(t({ ko: "제목 템플릿은 필수입니다.", en: "Title template is required.", ja: "タイトルテンプレートは必須です。", zh: "标题模板为必填项。" }));
      return;
    }
    const intervalNum = parseInt(form.interval_days, 10);
    if (!Number.isFinite(intervalNum) || intervalNum < 1) {
      setSaveError(t({ ko: "반복 간격은 1 이상의 정수여야 합니다.", en: "Interval must be a positive integer.", ja: "間隔は正の整数でなければなりません。", zh: "间隔必须为正整数。" }));
      return;
    }

    const payload: TaskScheduleCreateInput = {
      title_template: form.title_template.trim(),
      description_template: form.description_template.trim() || null,
      workflow_pack_key: form.workflow_pack_key.trim() || "report",
      interval_days: intervalNum,
      enabled: form.enabled,
    };

    setSaving(true);
    try {
      if (editId) {
        const result = await api.updateSchedule(editId, payload);
        setSchedules((prev) => prev.map((s) => (s.id === editId ? result.schedule : s)));
      } else {
        const result = await api.createSchedule(payload);
        setSchedules((prev) => [...prev, result.schedule]);
      }
      setShowForm(false);
      setEditId(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [editId, form, t]);

  const handleDelete = useCallback(
    async (s: TaskSchedule) => {
      const confirmed = window.confirm(
        t({
          ko: `'${s.title_template}' 일정을 삭제하시겠습니까?`,
          en: `Delete schedule '${s.title_template}'?`,
          ja: `スケジュール '${s.title_template}' を削除しますか？`,
          zh: `删除计划 '${s.title_template}'？`,
        }),
      );
      if (!confirmed) return;
      try {
        await api.deleteSchedule(s.id);
        setSchedules((prev) => prev.filter((x) => x.id !== s.id));
        if (editId === s.id) { setShowForm(false); setEditId(null); }
      } catch (err) {
        console.error("Delete schedule failed:", err);
      }
    },
    [editId, t],
  );

  const handleToggleEnabled = useCallback(async (s: TaskSchedule) => {
    try {
      const result = await api.updateSchedule(s.id, { enabled: !s.enabled });
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? result.schedule : x)));
    } catch (err) {
      console.error("Toggle schedule failed:", err);
    }
  }, []);

  const handleTriggerNow = useCallback(async (s: TaskSchedule) => {
    setTriggeringId(s.id);
    try {
      await api.triggerSchedule(s.id);
      await loadSchedules();
    } catch (err) {
      console.error("Trigger schedule failed:", err);
    } finally {
      setTriggeringId(null);
    }
  }, [loadSchedules]);

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
      <div className="rounded-xl p-5 text-center" style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}>
        <p className="text-sm text-red-400" role="alert">
          {t({ ko: "오류:", en: "Error:", ja: "エラー:", zh: "错误：" })} {loadError}
        </p>
        <button
          type="button"
          onClick={() => void loadSchedules()}
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
          {t({ ko: "예약 작업", en: "Scheduled Tasks", ja: "スケジュールタスク", zh: "计划任务" })}
          <span className="ml-2 font-normal normal-case" style={{ color: "var(--th-text-secondary)" }}>
            ({schedules.length})
          </span>
        </h3>
        {!showForm && (
          <button
            type="button"
            onClick={handleNew}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            + {t({ ko: "새 일정", en: "New Schedule", ja: "新規スケジュール", zh: "新建计划" })}
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <ScheduleForm
          t={t}
          isEdit={editId !== null}
          form={form}
          setForm={setForm}
          saving={saving}
          saveError={saveError}
          onSave={() => void handleSave()}
          onCancel={handleCancel}
        />
      )}

      {/* Schedule list */}
      <div className="space-y-2">
        {schedules.length === 0 && (
          <div className="rounded-xl p-8 text-center" style={{ background: "var(--th-card-bg)", border: "1px solid var(--th-card-border)" }}>
            <p className="text-sm" style={{ color: "var(--th-text-secondary)" }}>
              {t({ ko: "예약 작업 없음.", en: "No schedules found.", ja: "スケジュールなし。", zh: "暂无计划任务。" })}
            </p>
          </div>
        )}
        {schedules.map((s) => (
          <div
            key={s.id}
            className={`rounded-lg px-4 py-3 transition-opacity ${!s.enabled ? "opacity-60" : ""}`}
            style={{ background: "var(--th-input-bg)", border: "1px solid var(--th-card-border)" }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: "var(--th-text-primary)" }}>
                    {s.title_template}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: "var(--th-accent-bg, rgba(59,130,246,0.15))", color: "var(--th-accent, #60a5fa)" }}
                  >
                    {s.workflow_pack_key}
                  </span>
                </div>
                <div className="mt-0.5 text-xs flex gap-3 flex-wrap" style={{ color: "var(--th-text-muted, #94a3b8)" }}>
                  <span>
                    {t({ ko: "반복", en: "Every", ja: "繰り返し", zh: "每" })} {s.interval_days}d
                  </span>
                  <span>
                    {t({ ko: "다음", en: "Next", ja: "次回", zh: "下次" })}: {formatNextTrigger(s.next_trigger_at)}
                  </span>
                  {s.last_triggered_at && (
                    <span>
                      {t({ ko: "마지막", en: "Last", ja: "前回", zh: "上次" })}: {new Date(s.last_triggered_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleTriggerNow(s)}
                  disabled={triggeringId === s.id}
                  aria-label={`${t({ ko: "지금 실행", en: "Fire now", ja: "今すぐ実行", zh: "立即触发" })} ${s.title_template}`}
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                  style={{ background: "var(--th-input-bg)", color: "var(--th-text-secondary)", border: "1px solid var(--th-card-border)" }}
                >
                  {triggeringId === s.id
                    ? "..."
                    : t({ ko: "지금 실행", en: "Fire now", ja: "今すぐ実行", zh: "立即触发" })}
                </button>

                <button
                  type="button"
                  onClick={() => handleEdit(s)}
                  aria-label={`${t({ ko: "편집", en: "Edit", ja: "編集", zh: "编辑" })} ${s.title_template}`}
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{ background: "var(--th-input-bg)", color: "var(--th-text-secondary)", border: "1px solid var(--th-card-border)" }}
                >
                  {t({ ko: "편집", en: "Edit", ja: "編集", zh: "编辑" })}
                </button>

                <button
                  type="button"
                  onClick={() => void handleToggleEnabled(s)}
                  aria-label={`${s.enabled ? t({ ko: "비활성화", en: "Disable", ja: "無効化", zh: "禁用" }) : t({ ko: "활성화", en: "Enable", ja: "有効化", zh: "启用" })} ${s.title_template}`}
                  className={`relative h-6 w-11 rounded-full transition-colors ${s.enabled ? "bg-blue-500" : "bg-slate-600"}`}
                  role="switch"
                  aria-checked={s.enabled}
                >
                  <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${s.enabled ? "left-[22px]" : "left-0.5"}`} />
                </button>

                <button
                  type="button"
                  onClick={() => void handleDelete(s)}
                  aria-label={`${t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除" })} ${s.title_template}`}
                  className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{ background: "var(--th-danger-bg, rgba(248,113,113,0.12))", color: "var(--th-danger, #f87171)", border: "1px solid var(--th-danger-border, rgba(248,113,113,0.25))" }}
                >
                  {t({ ko: "삭제", en: "Delete", ja: "削除", zh: "删除" })}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
