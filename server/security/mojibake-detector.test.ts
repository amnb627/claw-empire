/**
 * 文字化け検出ユーティリティのテスト
 *
 * Mobile Inboxの文字化け検出機能を検証します。
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  MojibakeDetector,
  detectMojibake,
  detectMojibakeInObject,
  validateDataMojibake,
  validateWebSocketMessage,
  performEncodingHealthCheck,
  createMojibakeAwareLogger,
  MojibakeLogLevel,
  type MojibakeDetectionResult,
} from "./mojibake-detector";

describe("MojibakeDetector", () => {
  let detector: MojibakeDetector;

  beforeEach(() => {
    detector = new MojibakeDetector({ enableConsoleLog: false });
  });

  describe("基本検出機能", () => {
    it("正常な日本語テキストは文字化けとして検出されない", () => {
      const normalText = "これは正常な日本語のテキストです。";
      const result = detector.detect(normalText, "test");

      expect(result.detected).toBe(false);
      expect(result.patterns).toHaveLength(0);
      expect(result.severity).toBe(MojibakeLogLevel.DEBUG);
    });

    it("ひらがな・カタカナ・漢字の混在は正常に処理される", () => {
      const mixedText = "ひらがなカタカナ漢字の混在したテキストです。１２３ＡＢＣ";
      const result = detector.detect(mixedText, "test");

      expect(result.detected).toBe(false);
    });

    it("絵文字を含むテキストは正常に処理される", () => {
      const emojiText = "本日は🌞晴天です！😊 🇯🇵";
      const result = detector.detect(emojiText, "test");

      expect(result.detected).toBe(false);
    });

    it("空文字列は正常に処理される", () => {
      const result = detector.detect("", "test");

      expect(result.detected).toBe(false);
    });
  });

  describe("文字化けパターン検出", () => {
    it("Replacement Characterを検出できる", () => {
      const corruptedText = "これは文字化け�したテキストです。";
      const result = detector.detect(corruptedText, "test");

      expect(result.detected).toBe(true);
      expect(result.patterns).toContain("replacement-character");
      expect(result.severity).toBe(MojibakeLogLevel.ERROR);
    });

    it("機種依存文字を検出できる", () => {
      const deviceDependentText = "①丸数字②③と機種依存文字を使ったテキスト";
      const result = detector.detect(deviceDependentText, "test");

      expect(result.detected).toBe(true);
      expect(result.patterns).toContain("excess-device-dependent");
    });

    it("BOMを検出できる", () => {
      const bomText = "\uFEFFBOM付きテキスト";
      const result = detector.detect(bomText, "test");

      expect(result.detected).toBe(true);
      expect(result.patterns).toContain("bom-detected");
    });

    it("無効なUTF-8シーケンスを検出できる", () => {
      const invalidText = "通常テキスト\uFFFE\uFFFF異常";
      const result = detector.detect(invalidText, "test");

      expect(result.detected).toBe(true);
      expect(result.patterns).toContain("invalid-utf8-sequence");
    });
  });

  describe("重大度フィルタ", () => {
    it("INFOレベル以上の検出のみを行う", () => {
      const filterDetector = new MojibakeDetector({
        enableConsoleLog: false,
        minSeverity: MojibakeLogLevel.WARN,
      });

      const textWithInfo = "①丸数字情報レベル"; // INFOレベル
      const result = filterDetector.detect(textWithInfo, "test");

      expect(result.detected).toBe(false);
    });

    it("ERRORレベル以上の検出のみを行う", () => {
      const filterDetector = new MojibakeDetector({
        enableConsoleLog: false,
        minSeverity: MojibakeLogLevel.ERROR,
      });

      const textWithReplacement = "文字化け�あり"; // ERRORレベル
      const result = filterDetector.detect(textWithReplacement, "test");

      expect(result.detected).toBe(true);
      expect(result.patterns).toContain("replacement-character");
    });
  });

  describe("パターン無視", () => {
    it("指定したパターンを無視する", () => {
      const ignoreDetector = new MojibakeDetector({
        enableConsoleLog: false,
        ignorePatterns: ["excess-device-dependent"],
      });

      const deviceDependentText = "①丸数字②③";
      const result = ignoreDetector.detect(deviceDependentText, "test");

      expect(result.detected).toBe(false);
    });
  });

  describe("カスタムパターン", () => {
    it("カスタム検出パターンを追加できる", () => {
      const customDetector = new MojibakeDetector({
        enableConsoleLog: false,
        customPatterns: [
          {
            name: "test-pattern",
            regex: /TEST/g,
            severity: MojibakeLogLevel.WARN,
            description: "Test pattern for custom detection",
          },
        ],
      });

      const result = customDetector.detect("This is a TEST string", "test");

      expect(result.detected).toBe(true);
      expect(result.patterns).toContain("test-pattern");
    });
  });

  describe("履歴管理", () => {
    it("検出履歴を記録する", () => {
      detector.detect("正常テキスト", "source1");
      detector.detect("文字化け�あり", "source2");

      const history = detector.getHistory();

      expect(history).toHaveLength(2);
    });

    it("履歴の取得数を制限できる", () => {
      for (let i = 0; i < 10; i++) {
        detector.detect(`テキスト${i}`, "test");
      }

      const recentHistory = detector.getHistory(5);

      expect(recentHistory).toHaveLength(5);
    });

    it("履歴をクリアできる", () => {
      detector.detect("テキスト", "test");
      detector.clearHistory();

      const history = detector.getHistory();

      expect(history).toHaveLength(0);
    });
  });

  describe("統計情報", () => {
    it("検出統計を取得できる", () => {
      detector.detect("正常", "source1");
      detector.detect("文字化け�あり", "source2");
      detector.detect("①機種依存", "source3");

      const stats = detector.getStatistics();

      expect(stats.totalDetections).toBe(2); // 正常なテキストはカウントされない
      expect(stats.detectionsBySource["source2"]).toBe(1);
      expect(stats.detectionsBySource["source3"]).toBe(1);
    });
  });
});

describe("ユーティリティ関数", () => {
  describe("detectMojibake", () => {
    it("簡易関数で文字化け検出ができる", () => {
      const result = detectMojibake("正常テキスト", { enableConsoleLog: false });

      expect(result.detected).toBe(false);
    });

    it("文字化けを検出した場合に詳細を返す", () => {
      const result = detectMojibake("文字化け�あり", { enableConsoleLog: false });

      expect(result.detected).toBe(true);
      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.positions.length).toBeGreaterThan(0);
    });
  });

  describe("detectMojibakeInObject", () => {
    it("オブジェクト内の文字列を再帰的に検査する", () => {
      const obj = {
        normal: "正常テキスト",
        corrupted: "文字化け�あり",
        nested: {
          value: "①機種依存",
        },
        array: ["正常", "異常�文字"],
      };

      const results = detectMojibakeInObject(obj, { enableConsoleLog: false });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.path.includes("corrupted"))).toBe(true);
      expect(results.some((r) => r.path.includes("nested"))).toBe(true);
      expect(results.some((r) => r.path.includes("array"))).toBe(true);
    });

    it("正常なオブジェクトは空の結果を返す", () => {
      const obj = {
        normal: "正常テキスト",
        nested: {
          value: "ひらがなカタカナ漢字",
        },
      };

      const results = detectMojibakeInObject(obj, { enableConsoleLog: false });

      expect(results).toHaveLength(0);
    });
  });

  describe("validateDataMojibake", () => {
    it("正常なデータはバリデーションをパスする", () => {
      const data = {
        message: "正常メッセージ",
        items: ["項目1", "項目2"],
      };

      const result = validateDataMojibake(data, { enableConsoleLog: false });

      expect(result.success).toBe(true);
      expect(result.mojibakeDetected).toBe(false);
      expect(result.data).toEqual(data);
    });

    it("文字化けを含むデータはバリデーションに失敗する", () => {
      const data = {
        message: "文字化け�あり",
        items: ["正常"],
      };

      const result = validateDataMojibake(data, { enableConsoleLog: false });

      expect(result.success).toBe(false);
      expect(result.mojibakeDetected).toBe(true);
      expect(result.mojibakeReport).toBeDefined();
    });
  });

  describe("validateWebSocketMessage", () => {
    it("正常なWebSocketメッセージをバリデートする", () => {
      const message = JSON.stringify({ type: "chat", text: "こんにちは" });
      const result = validateWebSocketMessage(message, { enableConsoleLog: false });

      expect(result.success).toBe(true);
      expect(result.mojibakeDetected).toBe(false);
    });

    it("文字化けを含むメッセージを検出する", () => {
      const message = JSON.stringify({ type: "chat", text: "文字化け�あり" });
      const result = validateWebSocketMessage(message, { enableConsoleLog: false });

      expect(result.success).toBe(false);
      expect(result.mojibakeDetected).toBe(true);
    });

    it("オブジェクト形式のメッセージもバリデートできる", () => {
      const message = { type: "chat", text: "文字化け�あり" };
      const result = validateWebSocketMessage(message, { enableConsoleLog: false });

      expect(result.success).toBe(false);
      expect(result.mojibakeDetected).toBe(true);
    });
  });
});

describe("MojibakeAwareLogger", () => {
  it("ログ出力時に文字化け検出を行う", () => {
    const mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const logger = createMojibakeAwareLogger(mockLogger, { enableConsoleLog: false });

    logger.log("正常ログ");
    logger.warn("①機種依存文字を含む警告");
    logger.error("文字化け�ありのエラー");

    expect(mockLogger.log).toHaveBeenCalledWith("正常ログ");
    expect(mockLogger.warn).toHaveBeenCalledWith("①機種依存文字を含む警告");
    expect(mockLogger.error).toHaveBeenCalledWith("文字化け�ありのエラー");
  });
});

describe("performEncodingHealthCheck", () => {
  it("システム全体のエンコーディング健全性をチェックする", async () => {
    const result = await performEncodingHealthCheck();

    expect(result).toHaveProperty("healthy");
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("checks");
    expect(result.checks.length).toBeGreaterThan(0);

    // 各チェックに必要なプロパティがあることを確認
    for (const check of result.checks) {
      expect(check).toHaveProperty("name");
      expect(check).toHaveProperty("passed");
      expect(check).toHaveProperty("message");
    }
  });

  it("基本エンコード/デコードチェックが含まれる", async () => {
    const result = await performEncodingHealthCheck();

    expect(result.checks.some((c) => c.name.startsWith("encode-decode:"))).toBe(true);
  });

  it("JSONパースチェックが含まれる", async () => {
    const result = await performEncodingHealthCheck();

    expect(result.checks.some((c) => c.name.startsWith("json:"))).toBe(true);
  });

  it("URLエンコーディングチェックが含まれる", async () => {
    const result = await performEncodingHealthCheck();

    expect(result.checks.some((c) => c.name.startsWith("url-encoding:"))).toBe(true);
  });
});

describe("境界値テスト", () => {
  it("非常に長い文字列もサンプリングして検査する", () => {
    const detector = new MojibakeDetector({
      enableConsoleLog: false,
      maxSampleLength: 100,
    });

    const longText = "正常な日本語テキストです。".repeat(1000) + "文字化け�あり";
    const result = detector.detect(longText, "test");

    expect(result.detected).toBe(true);
  });

  it("特殊文字のみの文字列を処理できる", () => {
    const detector = new MojibakeDetector({ enableConsoleLog: false });

    const specialChars = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
    const result = detector.detect(specialChars, "test");

    expect(result.detected).toBe(false);
  });

  it("絵文字のみの文字列を処理できる", () => {
    const detector = new MojibakeDetector({ enableConsoleLog: false });

    const emojiOnly = "😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗☺😚😙";
    const result = detector.detect(emojiOnly, "test");

    expect(result.detected).toBe(false);
  });
});

describe("実際のユースケース", () => {
  it("APIリクエストボディの検証", () => {
    const requestBody = {
      title: "タスクタイトル",
      description: "これはタスクの説明です。",
      tags: ["重要", "緊急"],
    };

    const result = validateDataMojibake(requestBody, { enableConsoleLog: false });

    expect(result.success).toBe(true);
  });

  it("チャットメッセージの検証", () => {
    const chatMessage = {
      sender: "ユーザー1",
      content: "お疲れ様です。本日の進捗を報告します。🎉",
      timestamp: "2026-03-08T12:00:00+09:00",
    };

    const result = validateDataMojibake(chatMessage, { enableConsoleLog: false });

    expect(result.success).toBe(true);
  });

  it("日本語を含むエラーメッセージの検証", () => {
    const errorMessage = {
      code: "VALIDATION_ERROR",
      message: "入力値が正しくありません。確認してください。",
      details: [
        { field: "title", error: "タイトルは必須です" },
        { field: "deadline", error: "期限は未来の日付を指定してください" },
      ],
    };

    const result = validateDataMojibake(errorMessage, { enableConsoleLog: false });

    expect(result.success).toBe(true);
  });
});
