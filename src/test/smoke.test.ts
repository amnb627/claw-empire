import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createElement } from "react";

import { normalizeLanguage, localeName, pickLang, I18nProvider } from "../i18n.ts";
import { appendCapped, mergeSettingsWithDefaults, areTaskListsEquivalent } from "../app/utils.ts";
import AppLoadingScreen from "../app/AppLoadingScreen.tsx";
import MessageContent from "../components/MessageContent.tsx";

describe("frontend test baseline", () => {
  it("executes with JSDOM environment", () => {
    expect(typeof document).toBe("object");
    expect(document.createElement("div").tagName).toBe("DIV");
  });
});

// ---------------------------------------------------------------------------
// i18n — language normalization and text selection
// ---------------------------------------------------------------------------
describe("i18n utilities", () => {
  it("normalizeLanguage maps known BCP-47 codes to UiLanguage", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("ko")).toBe("ko");
    expect(normalizeLanguage("ja")).toBe("ja");
    expect(normalizeLanguage("zh")).toBe("zh");
  });

  it("normalizeLanguage falls back to 'en' for unknown codes", () => {
    expect(normalizeLanguage("fr")).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
    expect(normalizeLanguage("")).toBe("en");
  });

  it("localeName returns the name field for the given locale", () => {
    const obj = { name: "Tokyo", name_ko: "도쿄", name_ja: "東京", name_zh: "东京" };
    expect(localeName("en", obj)).toBe("Tokyo");
    expect(localeName("ko", obj)).toBe("도쿄");
    expect(localeName("ja", obj)).toBe("東京");
    expect(localeName("zh", obj)).toBe("东京");
  });

  it("pickLang selects the correct language variant from LangText", () => {
    const text = { ko: "안녕", en: "Hello", ja: "こんにちは", zh: "你好" };
    expect(pickLang("en", text)).toBe("Hello");
    expect(pickLang("ko", text)).toBe("안녕");
    expect(pickLang("ja", text)).toBe("こんにちは");
    expect(pickLang("zh", text)).toBe("你好");
  });

  it("pickLang falls back to 'en' when a language variant is missing", () => {
    const text = { ko: "안녕", en: "Hello" }; // no ja/zh
    expect(pickLang("ja", text)).toBe("Hello");
    expect(pickLang("zh", text)).toBe("Hello");
  });
});

// ---------------------------------------------------------------------------
// App utilities — pure functions
// ---------------------------------------------------------------------------
describe("app utils — appendCapped", () => {
  it("appends an item to an array up to the cap", () => {
    const result = appendCapped([1, 2, 3], 4, 5);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it("drops the oldest item when the cap is exceeded", () => {
    const result = appendCapped([1, 2, 3], 4, 3);
    expect(result).toEqual([2, 3, 4]);
    expect(result.length).toBe(3);
  });
});

describe("app utils — mergeSettingsWithDefaults", () => {
  it("returns a complete settings object when passed nothing", () => {
    const settings = mergeSettingsWithDefaults();
    expect(settings).toBeTruthy();
    expect(typeof settings).toBe("object");
    // Must have at least a companyName string field (camelCase in CompanySettings)
    expect(typeof settings.companyName).toBe("string");
    expect(settings.companyName.length).toBeGreaterThan(0);
  });

  it("preserves provided overrides", () => {
    const settings = mergeSettingsWithDefaults({ companyName: "Test Corp" });
    expect(settings.companyName).toBe("Test Corp");
  });
});

describe("app utils — areTaskListsEquivalent", () => {
  it("returns true for identical task lists", () => {
    const task = {
      id: "t1",
      title: "Task",
      description: null,
      status: "planned",
      priority: 1,
      department_id: "d1",
      assigned_agent_id: null,
      created_at: 1000,
      updated_at: 1000,
      completed_at: null,
      task_type: "general",
      project_id: null,
      project_path: null,
      workflow_pack_key: null,
      source_task_id: null,
      started_at: null,
    };
    expect(areTaskListsEquivalent([task], [task])).toBe(true);
  });

  it("returns false when lists have different lengths", () => {
    const task = {
      id: "t1",
      title: "Task",
      description: null,
      status: "planned",
      priority: 1,
      department_id: "d1",
      assigned_agent_id: null,
      created_at: 1000,
      updated_at: 1000,
      completed_at: null,
      task_type: "general",
      project_id: null,
      project_path: null,
      workflow_pack_key: null,
      source_task_id: null,
      started_at: null,
    };
    expect(areTaskListsEquivalent([task], [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// React components — render without crashing
// ---------------------------------------------------------------------------
describe("AppLoadingScreen renders without crashing", () => {
  it("displays the provided title and subtitle text", () => {
    render(
      createElement(AppLoadingScreen, {
        language: "en",
        title: "Loading…",
        subtitle: "Please wait",
      }),
    );
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.getByText("Please wait")).toBeTruthy();
  });
});

describe("MessageContent renders without crashing", () => {
  it("renders plain text content", () => {
    render(createElement(MessageContent, { content: "Hello world" }));
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  it("renders bold markdown syntax", () => {
    render(createElement(MessageContent, { content: "Some **bold** text" }));
    // The rendered output should contain "bold" inside a strong element
    const bold = document.querySelector("strong");
    expect(bold).toBeTruthy();
    expect(bold?.textContent).toBe("bold");
  });

  it("renders an empty string without throwing", () => {
    expect(() => render(createElement(MessageContent, { content: "" }))).not.toThrow();
  });
});

describe("I18nProvider renders children", () => {
  it("renders child content wrapped in provider", () => {
    render(
      createElement(I18nProvider, { language: "en" }, createElement("span", null, "i18n-child")),
    );
    expect(screen.getByText("i18n-child")).toBeTruthy();
  });
});
