import { useEffect } from "react";
import { useI18n } from "../i18n";

interface KeyboardHelpModalProps {
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string[];
  description: { ko: string; en: string; ja: string; zh: string };
}

// Chord group: one shared prefix key with multiple second-key → description pairs
interface ChordGroupEntry {
  prefix: string;
  chords: Array<{
    key: string;
    description: { ko: string; en: string; ja: string; zh: string };
  }>;
}

const SHORTCUT_ENTRIES: ShortcutEntry[] = [
  {
    keys: ["n"],
    description: { ko: "새 업무", en: "New task", ja: "新規タスク", zh: "新建任务" },
  },
  {
    keys: ["/"],
    description: { ko: "검색", en: "Search", ja: "検索", zh: "搜索" },
  },
  {
    keys: ["j", "k"],
    description: { ko: "태스크 탐색", en: "Navigate tasks", ja: "タスク移動", zh: "浏览任务" },
  },
  {
    keys: ["Enter"],
    description: { ko: "태스크 열기", en: "Open task", ja: "タスクを開く", zh: "打开任务" },
  },
  {
    keys: ["Esc"],
    description: { ko: "닫기 / 취소", en: "Close / Cancel", ja: "閉じる / キャンセル", zh: "关闭 / 取消" },
  },
  {
    keys: ["?"],
    description: { ko: "단축키 도움말", en: "This help", ja: "このヘルプ", zh: "此帮助" },
  },
];

// g-chord group: "g" prefix appears once; h and s are the second keys
const G_CHORD_GROUP: ChordGroupEntry = {
  prefix: "g",
  chords: [
    {
      key: "h",
      description: { ko: "태스크 보드로 이동", en: "Go to task board", ja: "タスクボードへ移動", zh: "前往任务看板" },
    },
    {
      key: "s",
      description: { ko: "설정으로 이동", en: "Go to settings", ja: "設定へ移動", zh: "前往设置" },
    },
  ],
};

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-200">
      {children}
    </kbd>
  );
}

export default function KeyboardHelpModal({ onClose }: KeyboardHelpModalProps) {
  const { t } = useI18n();

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={t({ ko: "키보드 단축키", en: "Keyboard Shortcuts", ja: "キーボードショートカット", zh: "键盘快捷键" })}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-white">
            {t({ ko: "키보드 단축키", en: "Keyboard Shortcuts", ja: "キーボードショートカット", zh: "键盘快捷键" })}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition"
            aria-label={t({ ko: "닫기", en: "Close", ja: "閉じる", zh: "关闭" })}
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          {SHORTCUT_ENTRIES.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1">
                {entry.keys.map((key, ki) => (
                  <span key={ki} className="flex items-center gap-1">
                    {ki > 0 && (
                      <span className="text-xs text-slate-500">
                        {t({ ko: "→", en: "→", ja: "→", zh: "→" })}
                      </span>
                    )}
                    <Kbd>{key}</Kbd>
                  </span>
                ))}
              </div>
              <span className="text-sm text-slate-400">
                {t(entry.description)}
              </span>
            </div>
          ))}

          {/* g-chord group: prefix "g" rendered once, then each second key on its own row */}
          {G_CHORD_GROUP.chords.map((chord, ci) => (
            <div key={`g-chord-${ci}`} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1">
                {ci === 0 ? (
                  <Kbd>{G_CHORD_GROUP.prefix}</Kbd>
                ) : (
                  <span className="w-[calc(1.25rem+0.5rem)] flex-shrink-0" aria-hidden="true" />
                )}
                <span className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">→</span>
                  <Kbd>{chord.key}</Kbd>
                </span>
              </div>
              <span className="text-sm text-slate-400">
                {t(chord.description)}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          {t({ ko: "Esc 또는 바깥 클릭으로 닫기", en: "Press Esc or click outside to close", ja: "Esc またはクリックで閉じる", zh: "按 Esc 或点击外部关闭" })}
        </p>
      </div>
    </div>
  );
}
