import { useEffect, useCallback } from "react";

export interface ShortcutHandler {
  key: string; // e.g. "n", "/"
  ctrl?: boolean; // require Ctrl/Cmd
  shift?: boolean;
  description: string;
  handler: () => void;
  when?: () => boolean; // only fire if condition is true
}

export function useKeyboardShortcuts(shortcuts: ShortcutHandler[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't fire when user is typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tagName = target.tagName ?? "";
      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        (typeof target.getAttribute === "function" && target.getAttribute("contenteditable") === "true") ||
        target.isContentEditable === true
      )
        return;

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;

        if (e.key.toLowerCase() === shortcut.key.toLowerCase() && ctrlMatch && shiftMatch) {
          if (shortcut.when && !shortcut.when()) continue;
          e.preventDefault();
          shortcut.handler();
          return;
        }
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
