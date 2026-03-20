import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import type { ShortcutHandler } from "./useKeyboardShortcuts";

// Probe component that registers shortcuts
function ShortcutProbe({ shortcuts }: { shortcuts: ShortcutHandler[] }) {
  useKeyboardShortcuts(shortcuts);
  return <div />;
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires handler for matching plain key", () => {
    const handler = vi.fn();
    render(
      <ShortcutProbe
        shortcuts={[{ key: "n", description: "New task", handler }]}
      />,
    );
    fireEvent.keyDown(window, { key: "n" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("fires handler for matching Ctrl+key combo", () => {
    const handler = vi.fn();
    render(
      <ShortcutProbe
        shortcuts={[{ key: "s", ctrl: true, description: "Save", handler }]}
      />,
    );
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire handler when Ctrl is pressed but shortcut does not require it", () => {
    const handler = vi.fn();
    render(
      <ShortcutProbe
        shortcuts={[{ key: "n", description: "New task", handler }]}
      />,
    );
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does NOT fire when user is typing in an INPUT element", () => {
    const handler = vi.fn();
    const { container } = render(
      <>
        <ShortcutProbe shortcuts={[{ key: "n", description: "New task", handler }]} />
        <input id="test-input" />
      </>,
    );
    const input = container.querySelector("#test-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "n", target: input });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does NOT fire when user is typing in a TEXTAREA element", () => {
    const handler = vi.fn();
    const { container } = render(
      <>
        <ShortcutProbe shortcuts={[{ key: "n", description: "New task", handler }]} />
        <textarea id="test-ta" />
      </>,
    );
    const ta = container.querySelector("#test-ta") as HTMLTextAreaElement;
    fireEvent.keyDown(ta, { key: "n", target: ta });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does NOT fire when user is typing in a SELECT element", () => {
    const handler = vi.fn();
    const { container } = render(
      <>
        <ShortcutProbe shortcuts={[{ key: "n", description: "New task", handler }]} />
        <select id="test-sel">
          <option>opt</option>
        </select>
      </>,
    );
    const sel = container.querySelector("#test-sel") as HTMLSelectElement;
    fireEvent.keyDown(sel, { key: "n", target: sel });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does NOT fire when contentEditable element is focused", () => {
    const handler = vi.fn();
    const { container } = render(
      <>
        <ShortcutProbe shortcuts={[{ key: "n", description: "New task", handler }]} />
        <div id="editable" contentEditable="true" />
      </>,
    );
    const div = container.querySelector("#editable") as HTMLDivElement;
    fireEvent.keyDown(div, { key: "n", target: div });
    expect(handler).not.toHaveBeenCalled();
  });

  it("respects the when() condition — does NOT fire when condition is false", () => {
    const handler = vi.fn();
    render(
      <ShortcutProbe
        shortcuts={[
          {
            key: "n",
            description: "New task",
            handler,
            when: () => false,
          },
        ]}
      />,
    );
    fireEvent.keyDown(window, { key: "n" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("respects the when() condition — fires when condition is true", () => {
    const handler = vi.fn();
    render(
      <ShortcutProbe
        shortcuts={[
          {
            key: "n",
            description: "New task",
            handler,
            when: () => true,
          },
        ]}
      />,
    );
    fireEvent.keyDown(window, { key: "n" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("fires handler for shift+key combo", () => {
    const handler = vi.fn();
    render(
      <ShortcutProbe
        shortcuts={[{ key: "?", shift: true, description: "Help", handler }]}
      />,
    );
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire shift shortcut without shift key", () => {
    const handler = vi.fn();
    render(
      <ShortcutProbe
        shortcuts={[{ key: "?", shift: true, description: "Help", handler }]}
      />,
    );
    fireEvent.keyDown(window, { key: "?", shiftKey: false });
    expect(handler).not.toHaveBeenCalled();
  });

  it("fires the first matching shortcut and stops", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    render(
      <ShortcutProbe
        shortcuts={[
          { key: "x", description: "First", handler: handler1 },
          { key: "x", description: "Second", handler: handler2 },
        ]}
      />,
    );
    fireEvent.keyDown(window, { key: "x" });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();
  });
});
