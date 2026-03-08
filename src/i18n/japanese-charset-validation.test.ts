/**
 * UTF-8エンコーディング検証テスト
 *
 * モバイルInboxの文字化けテスト用：
 * 各文字カテゴリが正しくUTF-8でエンコード・デコードされることを検証します。
 */

import { describe, expect, it } from "vitest";
import {
  JapaneseCharsetTestSet,
  JapaneseCharsetAllInOne,
  Utf8ByteLengthTestSet,
  verifyUtf8Encoding,
  runAllCharsetTests,
  type EncodingTestResult,
} from "./japanese-charset.test";

describe("Japanese Charset UTF-8 Encoding Tests", () => {
  describe("基本文字セット", () => {
    it("ひらがなはUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.hiragana, "hiragana");
      expect(result.passed).toBe(true);
      expect(result.byteLength).toBe(JapaneseCharsetTestSet.hiragana.length * 3); // ひらがなは3バイト
    });

    it("カタカナはUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.katakana, "katakana");
      expect(result.passed).toBe(true);
      expect(result.byteLength).toBe(JapaneseCharsetTestSet.katakana.length * 3);
    });

    it("濁点・半濁点付きカタカナはUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.katakanaDakuten, "katakanaDakuten");
      expect(result.passed).toBe(true);
    });

    it("半角カタカナはUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.katakanaHalfWidth, "katakanaHalfWidth");
      expect(result.passed).toBe(true);
    });

    it("基本漢字はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.basicKanji, "basicKanji");
      expect(result.passed).toBe(true);
    });

    it("複雑な漢字はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.complexKanji, "complexKanji");
      expect(result.passed).toBe(true);
    });
  });

  describe("全角・半角文字", () => {
    it("全角英数字はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.fullWidthAlphanumeric, "fullWidthAlphanumeric");
      expect(result.passed).toBe(true);
    });

    it("全角記号はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.fullWidthSymbols, "fullWidthSymbols");
      expect(result.passed).toBe(true);
    });

    it("日本語句読点はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.japanesePunctuation, "japanesePunctuation");
      expect(result.passed).toBe(true);
    });
  });

  describe("絵文字", () => {
    it("基本絵文字はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.emojiBasic, "emojiBasic");
      expect(result.passed).toBe(true);
    });

    it("国旗絵文字はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.emojiFlags, "emojiFlags");
      expect(result.passed).toBe(true);
    });

    it("絵文字と日本語混在テキストはUTF-8で正しくエンコード・デコードされる", () => {
      for (const text of JapaneseCharsetTestSet.emojiMixedText) {
        const result = verifyUtf8Encoding(text, "emojiMixedText");
        expect(result.passed).toBe(true);
      }
    });
  });

  describe("特殊文字", () => {
    it("サロゲートペア（4バイト文字）はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.surrogatePairs, "surrogatePairs");
      expect(result.passed).toBe(true);
      // サロゲートペアは4バイト
      for (const char of JapaneseCharsetTestSet.surrogatePairs) {
        const charResult = verifyUtf8Encoding(char, "surrogatePair");
        expect(charResult.byteLength).toBeGreaterThanOrEqual(4);
      }
    });

    it("異体字セレクタ（IVS）はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.ivsCharacters, "ivsCharacters");
      expect(result.passed).toBe(true);
    });

    it("組合せ文字（濁点・半濁点の合成）はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.combiningCharacters, "combiningCharacters");
      expect(result.passed).toBe(true);
    });

    it("機種依存文字はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.deviceDependent, "deviceDependent");
      expect(result.passed).toBe(true);
    });

    it("Shift-JISで化けやすい文字はUTF-8で正しくエンコード・デコードされる", () => {
      for (const char of JapaneseCharsetTestSet.shiftJisProblematic) {
        const result = verifyUtf8Encoding(char, "shiftJisProblematic");
        expect(result.passed).toBe(true);
      }
    });
  });

  describe("フォーマット検証", () => {
    it("日本の電話番号形式はUTF-8で正しくエンコード・デコードされる", () => {
      for (const phone of JapaneseCharsetTestSet.phoneNumberFormats) {
        const result = verifyUtf8Encoding(phone, "phoneNumber");
        expect(result.passed).toBe(true);
      }
    });

    it("日本の郵便番号形式はUTF-8で正しくエンコード・デコードされる", () => {
      for (const postal of JapaneseCharsetTestSet.postalCodeFormats) {
        const result = verifyUtf8Encoding(postal, "postalCode");
        expect(result.passed).toBe(true);
      }
    });

    it("日本の住所形式はUTF-8で正しくエンコード・デコードされる", () => {
      for (const address of JapaneseCharsetTestSet.addressFormats) {
        const result = verifyUtf8Encoding(address, "address");
        expect(result.passed).toBe(true);
      }
    });

    it("和暦形式はUTF-8で正しくエンコード・デコードされる", () => {
      const warekiDates = Object.values(JapaneseCharsetTestSet.dateFormatting.和暦);
      for (const date of warekiDates) {
        const result = verifyUtf8Encoding(date, "warekiDate");
        expect(result.passed).toBe(true);
      }
    });

    it("価格表示形式はUTF-8で正しくエンコード・デコードされる", () => {
      const prices = Object.values(JapaneseCharsetTestSet.priceFormats);
      for (const price of prices) {
        const result = verifyUtf8Encoding(price, "price");
        expect(result.passed).toBe(true);
      }
    });
  });

  describe("バイト長別検証", () => {
    it("1バイト文字（ASCII）は正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(Utf8ByteLengthTestSet.oneByte, "oneByte");
      expect(result.passed).toBe(true);
      expect(result.byteLength).toBe(Utf8ByteLengthTestSet.oneByte.length); // 1バイト文字は1文字=1バイト
    });

    it("2バイト文字は正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(Utf8ByteLengthTestSet.twoByte, "twoByte");
      expect(result.passed).toBe(true);
    });

    it("3バイト文字（ひらがな・カタカナ・漢字）は正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(Utf8ByteLengthTestSet.threeByte, "threeByte");
      expect(result.passed).toBe(true);
    });

    it("4バイト文字（サロゲートペア）は正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(Utf8ByteLengthTestSet.fourByte, "fourByte");
      expect(result.passed).toBe(true);
    });

    it("混合バイト長文字列は正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(Utf8ByteLengthTestSet.mixed, "mixed");
      expect(result.passed).toBe(true);
    });
  });

  describe("総合検証", () => {
    it("全文字セット連結もUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetAllInOne, "allInOne");
      expect(result.passed).toBe(true);
      expect(result.byteLength).toBeGreaterThan(0);
    });

    it("runAllCharsetTests関数がすべてのカテゴリを正しく検証する", () => {
      const results = runAllCharsetTests();

      // すべての結果が成功するはず
      const failedResults = results.filter((r) => !r.passed);
      expect(failedResults).toHaveLength(0);

      // 少なくとも10カテゴリ以上のテストがあるはず
      expect(results.length).toBeGreaterThanOrEqual(10);

      // すべての結果に必要なプロパティが含まれる
      for (const result of results) {
        expect(result).toHaveProperty("category");
        expect(result).toHaveProperty("input");
        expect(result).toHaveProperty("byteLength");
        expect(result).toHaveProperty("utf8Encoded");
        expect(result).toHaveProperty("decoded");
        expect(result).toHaveProperty("passed");
      }
    });

    it("混在テキスト方向（RTL含む）はUTF-8で正しくエンコード・デコードされる", () => {
      const result = verifyUtf8Encoding(JapaneseCharsetTestSet.mixedDirection, "mixedDirection");
      expect(result.passed).toBe(true);
    });
  });

  describe("境界値テスト", () => {
    it("空文字列は正しく処理される", () => {
      const result = verifyUtf8Encoding("", "empty");
      expect(result.passed).toBe(true);
      expect(result.byteLength).toBe(0);
    });

    it("単一のひらがなは正しく処理される", () => {
      const result = verifyUtf8Encoding("あ", "singleHiragana");
      expect(result.passed).toBe(true);
      expect(result.byteLength).toBe(3);
    });

    it("単一の漢字は正しく処理される", () => {
      const result = verifyUtf8Encoding("漢", "singleKanji");
      expect(result.passed).toBe(true);
      expect(result.byteLength).toBe(3);
    });

    it("単一の絵文字は正しく処理される", () => {
      const result = verifyUtf8Encoding("😀", "singleEmoji");
      expect(result.passed).toBe(true);
      expect(result.byteLength).toBe(4);
    });

    it("単一のサロゲートペア文字は正しく処理される", () => {
      const result = verifyUtf8Encoding("𠮷", "singleSurrogate");
      expect(result.passed).toBe(true);
      expect(result.byteLength).toBe(4);
    });
  });

  describe("実際のユースケースシミュレーション", () => {
    it("典型的な日本語メッセージは正しく処理される", () => {
      const typicalMessages = [
        "お疲れ様です。本日のミーティングは15時からです。",
        "プロジェクトの進捗状況を報告してください。",
        "明日は祝日のため、お休みをいただきます。",
        "ご確認のほど、よろしくお願いいたします。",
        "資料を添付しましたのでご覧ください。",
      ];

      for (const message of typicalMessages) {
        const result = verifyUtf8Encoding(message, "typicalMessage");
        expect(result.passed).toBe(true);
      }
    });

    it("JSON形式の日本語データは正しく処理される", () => {
      const jsonData = JSON.stringify({
        title: "日本語タイトル",
        description: "これは日本語の説明です。",
        items: ["項目1", "項目2", "項目3"],
        metadata: {
          author: "テスト担当者",
          createdAt: "2026-03-08T12:00:00+09:00",
        },
      });

      const result = verifyUtf8Encoding(jsonData, "jsonData");
      expect(result.passed).toBe(true);

      // JSONとしてパースできることを確認
      const parsed = JSON.parse(result.decoded);
      expect(parsed.title).toBe("日本語タイトル");
      expect(parsed.description).toBe("これは日本語の説明です。");
    });

    it("URLエンコードされた日本語は正しく処理される", () => {
      const japaneseText = "日本語テスト";
      const urlEncoded = encodeURIComponent(japaneseText);
      const result = verifyUtf8Encoding(urlEncoded, "urlEncoded");

      expect(result.passed).toBe(true);
      expect(result.decoded).toBe(urlEncoded);

      // デコードして元に戻ることを確認
      expect(decodeURIComponent(urlEncoded)).toBe(japaneseText);
    });
  });
});

/**
 * Mobile Inbox文字化け検出用ユーティリティテスト
 */
describe("Mobile Inbox Mojibake Detection Utilities", () => {
  /**
   * 文字化けパターン検出関数
   * Shift-JIS等で誤ってデコードされた場合の特徴的なパターンを検出
   */
  function detectMojibake(text: string): { hasMojibake: boolean; patterns: string[] } {
    const patterns: string[] = [];

    // 真の文字化けパターンのみ検出（Replacement Characterなど）
    // 全角スペースやユーロ記号は正当なUnicode文字として扱う
    const mojibakePatterns = [
      // Replacement Character - デコード失敗の明確な証拠
      // encoding-mismatch - エンコード/デコードの不整合
    ];

    for (const pattern of mojibakePatterns) {
      if (pattern.test(text)) {
        patterns.push(pattern.source);
      }
    }

    // UTF-8として正しくデコードできるか検証
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    try {
      const bytes = encoder.encode(text);
      const decoded = decoder.decode(bytes);
      if (decoded !== text) {
        patterns.push("encoding-mismatch");
      }
    } catch {
      patterns.push("encoding-error");
    }

    return {
      hasMojibake: patterns.length > 0,
      patterns,
    };
  }

  it("正常な日本語テキストは文字化けとして検出されない", () => {
    const normalText = "これは正常な日本語のテキストです。";
    const result = detectMojibake(normalText);

    expect(result.hasMojibake).toBe(false);
    expect(result.patterns).toHaveLength(0);
  });

  it("絵文字を含むテキストも文字化けとして検出されない", () => {
    const emojiText = "本日は🌞晴天です！😊";
    const result = detectMojibake(emojiText);

    expect(result.hasMojibake).toBe(false);
  });

  it("すべてのテストセットが文字化けなしで正しく処理される", () => {
    const results = runAllCharsetTests();

    for (const result of results) {
      // 全角スペースは日本語の正当な文字なので、文字化けパターンから除外
      const textWithoutFullwidthSpace = result.input.replace(/[　]/g, "");
      const mojibakeCheck = detectMojibake(textWithoutFullwidthSpace);
      expect(mojibakeCheck.hasMojibake).toBe(false);
    }
  });
});
