import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import PackSchemaFields from "./PackSchemaFields";
import type { PackInputSchema } from "../../../utils/packPrompt";
import { assemblePackPrompt } from "../../../utils/packPrompt";

const schema: PackInputSchema = {
  required: ["facility", "visit_date"],
  optional: ["notes"],
};

const t = (m: Record<string, string>) => m.en;

const defaultProps = {
  schema,
  packName: "Facility Visit",
  fieldValues: {},
  notes: "",
  previewExpanded: false,
  assembledPrompt: assemblePackPrompt("Facility Visit", schema, {}, ""),
  t,
  onFieldChange: vi.fn(),
  onNotesChange: vi.fn(),
  onTogglePreview: vi.fn(),
};

function renderComponent(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(
    <I18nProvider language="en">
      <PackSchemaFields {...props} />
    </I18nProvider>,
  );
}

describe("PackSchemaFields", () => {
  it("renders required field inputs with testids", () => {
    renderComponent();
    expect(screen.getByTestId("pack-field-facility")).toBeInTheDocument();
    expect(screen.getByTestId("pack-field-visit_date")).toBeInTheDocument();
  });

  it("labels required fields with title-cased text and required marker", () => {
    renderComponent();
    expect(screen.getByText("Facility")).toBeInTheDocument();
    expect(screen.getByText("Visit Date")).toBeInTheDocument();
    // Required marker asterisks
    const markers = screen.getAllByTitle("Required");
    expect(markers.length).toBeGreaterThanOrEqual(2);
  });

  it("shows optional field count in toggle button", () => {
    renderComponent();
    expect(screen.getByText("Optional fields (1)")).toBeInTheDocument();
  });

  it("optional fields are hidden by default", () => {
    renderComponent();
    expect(screen.queryByTestId("pack-field-notes")).not.toBeInTheDocument();
  });

  it("reveals optional fields on click", () => {
    renderComponent();
    fireEvent.click(screen.getByText("Optional fields (1)"));
    expect(screen.getByTestId("pack-field-notes")).toBeInTheDocument();
  });

  it("calls onFieldChange when required field is changed", () => {
    const onFieldChange = vi.fn();
    renderComponent({ onFieldChange });
    fireEvent.change(screen.getByTestId("pack-field-facility"), { target: { value: "Mie University" } });
    expect(onFieldChange).toHaveBeenCalledWith("facility", "Mie University");
  });

  it("calls onNotesChange when notes textarea is changed", () => {
    const onNotesChange = vi.fn();
    renderComponent({ onNotesChange });
    fireEvent.change(screen.getByTestId("pack-notes"), { target: { value: "some notes" } });
    expect(onNotesChange).toHaveBeenCalledWith("some notes");
  });

  it("prompt preview is hidden by default", () => {
    renderComponent();
    expect(screen.queryByTestId("pack-prompt-preview")).not.toBeInTheDocument();
  });

  it("calls onTogglePreview when preview button is clicked", () => {
    const onTogglePreview = vi.fn();
    renderComponent({ onTogglePreview });
    fireEvent.click(screen.getByText("Prompt Preview"));
    expect(onTogglePreview).toHaveBeenCalledTimes(1);
  });

  it("shows assembled prompt when previewExpanded is true", () => {
    const prompt = assemblePackPrompt("Facility Visit", schema, { facility: "Mie", visit_date: "2026-03-25" }, "");
    renderComponent({ previewExpanded: true, assembledPrompt: prompt, fieldValues: { facility: "Mie", visit_date: "2026-03-25" } });
    const preview = screen.getByTestId("pack-prompt-preview");
    expect(preview).toBeInTheDocument();
    expect(preview.textContent).toContain("Facility Visit");
    expect(preview.textContent).toContain("Mie");
  });

  it("renders pack name badge", () => {
    renderComponent();
    expect(screen.getByText("Facility Visit")).toBeInTheDocument();
  });
});

describe("CreateTaskModal pack-form integration: falls back to free-text for empty schema", () => {
  it("assemblePackPrompt handles empty optional schema gracefully", () => {
    const emptySchema: PackInputSchema = { required: ["goal", "audience", "format"], optional: [] };
    const result = assemblePackPrompt("Structured Report", emptySchema, {
      goal: "Test the system",
      audience: "Developers",
      format: "markdown",
    });
    expect(result).toContain("## Task: Structured Report");
    expect(result).toContain("**Goal**: Test the system");
    expect(result).toContain("**Audience**: Developers");
    expect(result).toContain("**Format**: markdown");
  });
});
