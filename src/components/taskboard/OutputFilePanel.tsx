import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../i18n";
import * as api from "../../api";
import type { OutputFileEntry } from "../../api";

interface OutputFilePanelProps {
  taskId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface FilePreviewModalProps {
  taskId: string;
  filename: string;
  onClose: () => void;
}

function FilePreviewModal({ taskId, filename, onClose }: FilePreviewModalProps) {
  const { t } = useI18n();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTaskOutputFile(taskId, filename)
      .then((result) => {
        setContent(result.content);
      })
      .catch((err) => {
        setError(String(err?.message ?? "Failed to load file"));
      })
      .finally(() => setLoading(false));
  }, [taskId, filename]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <span className="font-mono text-sm text-slate-200">{filename}</span>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition"
            aria-label={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭" })}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && (
            <p className="text-sm text-slate-500">
              {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中..." })}
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {content !== null && !loading && (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OutputFilePanel({ taskId }: OutputFilePanelProps) {
  const { t } = useI18n();
  const [files, setFiles] = useState<OutputFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const loadFiles = useCallback(() => {
    setLoading(true);
    api
      .getTaskOutputFiles(taskId)
      .then((result) => {
        setFiles(result.files);
      })
      .catch(() => {
        setFiles([]);
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  if (loading) {
    return (
      <div className="mt-4">
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          {t({ ko: "출력 파일", en: "Output Files", ja: "出力ファイル", zh: "输出文件" })}
        </h4>
        <p className="text-xs text-slate-600">
          {t({ ko: "불러오는 중...", en: "Loading...", ja: "読み込み中...", zh: "加载中..." })}
        </p>
      </div>
    );
  }

  if (files.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {t({ ko: "출력 파일", en: "Output Files", ja: "出力ファイル", zh: "输出文件" })}
          <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
            {files.length}
          </span>
        </h4>
        <button
          onClick={loadFiles}
          className="text-xs text-slate-600 hover:text-slate-400 transition"
          aria-label={t({ ko: "새로고침", en: "Refresh", ja: "更新", zh: "刷新" })}
        >
          ↻
        </button>
      </div>

      <div className="space-y-1">
        {files.map((file) => (
          <div key={file.name} className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
            <span className="truncate font-mono text-xs text-slate-300">{file.name}</span>
            <div className="ml-2 flex shrink-0 items-center gap-2">
              <span className="text-[10px] text-slate-600">{formatBytes(file.size)}</span>
              {file.previewable && (
                <button
                  onClick={() => setPreviewFile(file.name)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition"
                >
                  {t({ ko: "보기", en: "View", ja: "表示", zh: "查看" })}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {previewFile && <FilePreviewModal taskId={taskId} filename={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}
