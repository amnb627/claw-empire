import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import KeyboardHelpModal from "./KeyboardHelpModal";

function renderModal(onClose = vi.fn()) {
  return render(
    <I18nProvider language="en">
      <KeyboardHelpModal onClose={onClose} />
    </I18nProvider>,
  );
}

describe("KeyboardHelpModal", () => {
  it("renders the heading", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });

  it("renders all shortcut keys", () => {
    renderModal();
    // Check that all expected key indicators are rendered
    expect(screen.getByText("n")).toBeInTheDocument();
    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.getByText("j")).toBeInTheDocument();
    expect(screen.getByText("k")).toBeInTheDocument();
    expect(screen.getByText("Enter")).toBeInTheDocument();
    expect(screen.getByText("Esc")).toBeInTheDocument();
    expect(screen.getByText("g")).toBeInTheDocument();
    expect(screen.getByText("h")).toBeInTheDocument();
    expect(screen.getByText("s")).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders all shortcut descriptions", () => {
    renderModal();
    expect(screen.getByText("New task")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Navigate tasks")).toBeInTheDocument();
    expect(screen.getByText("Open task")).toBeInTheDocument();
    expect(screen.getByText("Close / Cancel")).toBeInTheDocument();
    expect(screen.getByText("Go to task board")).toBeInTheDocument();
    expect(screen.getByText("Go to settings")).toBeInTheDocument();
    expect(screen.getByText("This help")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider language="en">
        <KeyboardHelpModal onClose={onClose} />
      </I18nProvider>,
    );
    // Click the outer backdrop div (the dialog role element)
    const backdrop = screen.getByRole("dialog");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
