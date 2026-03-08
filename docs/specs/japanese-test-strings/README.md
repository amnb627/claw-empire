# Japanese Text Test Strings

**作成日**: 2026-03-08
**担当**: Planning Team (Clio)
**バージョン**: 1.0.0

---

## 概要

Mobile Inboxの日本語表示テスト用文字列セットです。各カテゴリ別にJSON形式で定義されています。

---

## ファイル構成

| ファイル | カテゴリ | 説明 |
|:---------|:---------|:-----|
| `basic.json` | 基本文字列 | ひらがな、カタカナ、常用漢字 |
| `surrogate-pairs.json` | サロゲートペア | U+10000以上の文字（𠮷、𩸽など） |
| `ivs.json` | 異体字セレクタ | IVSによる異体字表現 |
| `emoji-japanese.json` | 絵文字混在 | 絵文字と日本語の混在テキスト |
| `full-half-width.json` | 全角半角混在 | 全角と半角の混在テキスト |
| `boundary.json` | 境界値テスト | 空文字、超長文字列などエッジケース |

---

## 使用方法

### TypeScript/JavaScript

```typescript
import basicStrings from './basic.json';
import surrogatePairs from './surrogate-pairs.json';

// テスト実行
basicStrings.strings.forEach(testCase => {
  const result = renderText(testCase.text);
  console.assert(
    result.length === testCase.expected_length,
    `${testCase.id}: Expected ${testCase.expected_length}, got ${result.length}`
  );
});

// サロゲートペアの正しい文字数カウント
function countCharacters(str: string): number {
  return [...str].length; // スプレッド構文でサロゲートペアを1文字としてカウント
}

surrogatePairs.strings.forEach(testCase => {
  const count = countCharacters(testCase.text);
  console.assert(
    count === testCase.visual_length,
    `${testCase.id}: Expected ${testCase.visual_length}, got ${count}`
  );
});
```

### Jestテスト例

```typescript
describe('Japanese Text Rendering', () => {
  describe('Basic Characters', () => {
    test.each(basicStrings.strings)('$label', ({ text, expected_length }) => {
      const rendered = renderText(text);
      expect(rendered).toHaveLength(expected_length);
    });
  });

  describe('Surrogate Pairs', () => {
    test.each(surrogatePairs.strings)('$label', ({ text, visual_length }) => {
      const count = [...text].length;
      expect(count).toBe(visual_length);
    });
  });
});
```

---

## JSONスキーマ

```json
{
  "name": "セット名",
  "category": "カテゴリ",
  "description": "説明",
  "version": "1.0.0",
  "created": "2026-03-08",
  "strings": [
    {
      "id": "unique-id",
      "label": "テストケース名",
      "text": "実際のテスト文字列",
      "expected_length": 10,
      "js_length": 10,
      "visual_length": 10,
      "code_point": "U+20BB7",
      "note": "追加メモ",
      "priority": "P0"
    }
  ]
}
```

### フィールド説明

| フィールド | 型 | 必須 | 説明 |
|:----------|:---|:-----|:-----|
| `id` | string | ✅ | 一意識別子 |
| `label` | string | ✅ | テストケース名 |
| `text` | string | ✅ | テスト文字列 |
| `expected_length` | number | - | 期待される文字列長（通常） |
| `js_length` | number | - | JavaScriptの`.length`プロパティ値（サロゲートペア用） |
| `visual_length` | number | - | 見た目の文字数（サロゲートペアは1） |
| `code_point` | string | - | Unicodeコードポイント |
| `note` | string | - | 追加メモ |
| `priority` | string | - | P0/P1/P2 の優先度 |

---

## 優先度定義

| 優先度 | 説明 | 合格条件 |
|:-------|:-----|:---------|
| **P0** | Critical | 全て合格でなければリリース不可 |
| **P1** | High | 80%以上の合格率 |
| **P2** | Medium | 代替表示があれば許容 |

---

## 既知の制限

### IVS（異体字セレクタ）

- 全てのデバイス/ブラウザがIVSをサポートしているわけではありません
- サポート外デバイスではベース文字のみ表示されます
- 代替表示（豆腐文字□）でのフォールバックが必要です

### サロゲートペア

- JavaScriptの`.length`プロパティはサロゲートペアを2文字としてカウントします
- 正しい文字数カウントには`[...str].length`または`Array.from(str).length`を使用してください

### 絵文字

- 一部の絵文字（特にスキントーン修飾子付き）はサロゲートペアとして扱われます
- 異なるOSで表示が異なる場合があります

---

## 関連ドキュメント

- [日本語テスト実行タスク定義書](../../plans/2026-03-08-japanese-text-test-execution.md)
- [品質管理チーム成果物](../../qa/2026-03-08-webhook-integration-test-qa-deliverables.md)
- [デザインチームUI設計](../../design-team-webhook-integration-test-ui.md)

---

**最終更新**: 2026-03-08
