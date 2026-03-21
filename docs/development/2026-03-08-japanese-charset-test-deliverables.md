# [開発チーム] 日本語文字化けテスト成果物

**作成日**: 2026-03-08
**担当チーム**: 開発チーム
**関連タスク**: [Mobile Inbox] 日本語テストタスク

---

## 概要

本ドキュメントはMobile Inboxにおける日本語文字化け対策のための開発チーム成果物を統合したものです。
以下の3つの技術成果物を提供します。

1. **UTF-8検証用テスト文字列セット**
2. **モバイルAPI/DB/フロントエンド各層のエンコーディング設定確認スクリプト**
3. **文字化け検出用ログ監視ユーティリティ**

---

## 1. UTF-8検証用テスト文字列セット

### ファイル構成

```
src/i18n/
├── japanese-charset.test.ts           # テスト文字列セット定義
└── japanese-charset-validation.test.ts # UTF-8検証テスト
```

### 提供する文字セット

| カテゴリ     | 説明                              | 主な用途                         |
| :----------- | :-------------------------------- | :------------------------------- |
| 基本文字     | ひらがな、カタカナ、基本漢字      | 一般的な日本語テキスト検証       |
| 全角・半角   | 全角英数字、全角記号、半角カナ    | フォーム入力、データベース保存   |
| 絵文字       | 基本絵文字、国旗、シンボル        | チャット、コメント機能           |
| 特殊文字     | サロゲートペア、IVS、機種依存文字 | 人名、住所、特殊表現             |
| フォーマット | 電話番号、郵便番号、住所、日付    | データ入力・表示検証             |
| 組み合わせ   | 各バイト長混在、絵文字混在        | 実際の使用ケースシミュレーション |

### 使用方法

```typescript
import { JapaneseCharsetTestSet, verifyUtf8Encoding, runAllCharsetTests } from "./i18n/japanese-charset.test";

// 基本的な使用
const result = verifyUtf8Encoding("テスト文字列", "category-name");
console.log(result.passed); // boolean
console.log(result.byteLength); // UTF-8バイト長

// すべての文字セットを一括検証
const allResults = runAllCharsetTests();
console.log(allResults); // EncodingTestResult[]
```

### テスト実行

```bash
# すべての文字化けテストを実行
npm test -- japanese-charset

# 特定のテストスイートを実行
npm test -- japanese-charset-validation
```

### テストカバレッジ

- ✅ 基本ひらがな・カタカナ（46文字ずつ）
- ✅ 濁点・半濁点付きカタカナ
- ✅ 半角カタカナ
- ✅ 全角英数字・記号
- ✅ 基本漢字・複雑な漢字（人名用・異体字）
- ✅ 絵文字（基本、国旗、シンボル）
- ✅ サロゲートペア（4バイトUTF-8）
- ✅ 異体字セレクタ（IVS）
- ✅ 組合せ文字（濁点・半濁点の合成）
- ✅ 機種依存文字
- ✅ 日本の電話番号・郵便番号・住所形式
- ✅ 和暦・西暦形式
- ✅ 価格表示形式
- ✅ Shift-JISで化けやすい文字

---

## 2. エンコーディング設定確認スクリプト

### ファイル構成

```
scripts/
└── check-encoding.mjs    # エンコーディング設定確認スクリプト
```

### 機能

以下の各層のエンコーディング設定を一括チェックします。

| チェック項目   | 説明                                                  |
| :------------- | :---------------------------------------------------- |
| Project        | package.json、tsconfig.json                           |
| Build          | Vite設定                                              |
| Frontend       | HTML/CSSのcharset宣言、コンポーネントエンコーディング |
| Backend        | Express/APIのContent-Type設定                         |
| Database       | データベース接続文字列のcharset設定                   |
| VCS            | .gitattributesの設定                                  |
| CI/CD          | GitHub Actions等のワークフロー設定                    |
| Infrastructure | Dockerfileの環境変数設定                              |
| Runtime        | 実行環境のLANG/LC_ALL設定                             |

### 使用方法

```bash
# 基本実行
node scripts/check-encoding.mjs

# 詳細モード
node scripts/check-encoding.mjs --verbose

# JSON出力
node scripts/check-encoding.mjs --json

# CI/CDパイプライン用（終了コードで判定）
node scripts/check-encoding.mjs && echo "OK" || echo "NG"
```

### 出力例

```
[INFO] Starting encoding check for Mobile Inbox...
============================================================
ENCODING CHECK SUMMARY
============================================================

[OK] Project: package.json encoding config
[OK] Project: tsconfig.json
[OK] Build: vite.config.ts
[OK] Frontend: HTML charset declaration
[OK] Frontend: CSS charset declaration
[OK] Frontend: Component encoding
[OK] Backend: API encoding configuration
[OK] Backend: Database encoding configuration
[OK] VCS: .gitattributes encoding
[OK] CI/CD: Workflow encoding settings
[OK] Infrastructure: Docker encoding settings
[OK] Runtime: Environment encoding

============================================================
Total: 12 | 12 passed | 0 failed
============================================================
```

### CI/CDへの組み込み

```yaml
# .github/workflows/encoding-check.yml
name: Encoding Check

on: [push, pull_request]

jobs:
  encoding-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "22"
      - run: node scripts/check-encoding.mjs
```

---

## 3. 文字化け検出用ログ監視ユーティリティ

### ファイル構成

```
server/security/
├── mojibake-detector.ts       # 文字化け検出ユーティリティ
└── mojibake-detector.test.ts  # テスト
```

### 機能

| 機能              | 説明                                                       |
| :---------------- | :--------------------------------------------------------- |
| パターン検出      | Shift-JIS化け、Replacement Character、機種依存文字等を検出 |
| 重大度レベル      | DEBUG/INFO/WARN/ERROR/CRITICALの5段階                      |
| 履歴管理          | 検出履歴の記録・統計取得                                   |
| オブジェクト検査  | JSON・オブジェクト内の全文字列を再帰的に検査               |
| APIバリデーション | リクエスト/レスポンスデータの検証                          |
| WebSocket検証     | WebSocketメッセージの検証                                  |
| ヘルスチェック    | システム全体のエンコーディング健全性チェック               |

### 使用方法

```typescript
import {
  MojibakeDetector,
  detectMojibake,
  detectMojibakeInObject,
  validateDataMojibake,
  validateWebSocketMessage,
  performEncodingHealthCheck,
} from "./server/security/mojibake-detector";

// 基本的な検出
const detector = new MojibakeDetector();
const result = detector.detect("テキスト", "source-name");
if (result.detected) {
  console.warn("文字化け検出:", result.patterns);
}

// APIリクエストの検証
const apiResult = validateDataMojibake(requestBody);
if (!apiResult.success) {
  // 文字化けが検出された場合の処理
  return { error: "Encoding issue detected", details: apiResult.mojibakeReport };
}

// オブジェクト全体の検査
const objectIssues = detectMojibakeInObject(userData);
for (const issue of objectIssues) {
  console.log(`Path: ${issue.path}, Patterns: ${issue.result.patterns}`);
}
```

### 検出パターン

| パターン名              | 説明                                  | 重大度 |
| :---------------------- | :------------------------------------ | :----- |
| replacement-character   | でコード失敗したReplacement Character | ERROR  |
| invalid-utf8-sequence   | 無効なUTF-8シーケンス                 | ERROR  |
| shift-jis-double-accent | Shift-JIS誤デコードのダブルアクセント | WARN   |
| shift-jis-cedilla       | Shift-JIS誤デコードのセディラ         | WARN   |
| excess-device-dependent | 機種依存文字の過度な使用              | INFO   |
| bom-detected            | BOM（Byte Order Mark）検出            | INFO   |

### 定期ヘルスチェック

```typescript
// 定期実行用のヘルスチェック（cron等から呼び出し）
const healthResult = await performEncodingHealthCheck();
if (!healthResult.healthy) {
  // アラート送信
  sendAlert("Encoding health check failed", healthResult.checks);
}
```

### テスト実行

```bash
# 文字化け検出ユーティリティのテスト
npm test -- mojibake-detector
```

---

## 連携他チームへの引き継ぎ

### デザインチームへ

提供したテスト文字列セットを使用して、以下の確認をお願いします。

1. **Noto Sans JP/M PLUSの各デバイス別レンダリング検証**
   - `JapaneseCharsetTestSet` の各カテゴリを表示テストに使用
   - 特に絵文字、サロゲートペア、機種依存文字の表示確認

2. **フォールバックUI仕様の検討**
   - `detectMojibake()` で文字化け検出時のUI表示案を作成

### 品質管理チームへ

1. **自動テストスイートへの統合**
   - `japanese-charset-validation.test.ts` をCI/CDパイプラインに組み込み
   - 各OS・ブラウザ combinationsのエンコーディング検証マトリックス作成

2. **監視アラート設定**
   - `performEncodingHealthCheck()` を定期実行し、失敗時にアラート

### インフラセキュリティチームへ

1. **CI/CDパイプライン監査**
   - `check-encoding.mjs` をPRマージ時の必須チェックに設定
   - GitHub Actionsの `JAVA_TOOL_OPTIONS` 等のUTF-8設定確認

2. **ログ監視システム連携**
   - `MojibakeDetector` の検出結果をCloudWatch Logs等へ転送

### 運営チームへ

1. **エスカレーション手順書**
   - 文字化け検出時の対応フロー:
     1. `detectMojibake()` が検出
     2. ログにパターン・重大度を出力
     3. ERROR/CRITICALの場合即時エスカレーション
     4. 該当データのバックアップ・修正

2. **月次健康診断**
   - `performEncodingHealthCheck()` を月次実行し、結果を記録

---

## 技術仕様まとめ

### エンコーディング方針

| レイヤー       | 設定値                                                |
| :------------- | :---------------------------------------------------- |
| フロントエンド | UTF-8 (HTML: `<meta charset="UTF-8">`)                |
| API            | UTF-8 (Content-Type: application/json; charset=utf-8) |
| データベース   | UTF-8 (charset: utf8mb4)                              |
| ソースコード   | UTF-8 (BOMなし)                                       |
| Git            | text=auto, eol=lf                                     |

### 対応範囲

- ✅ 1バイト文字（ASCII）
- ✅ 2バイト文字（ラテン1拡張）
- ✅ 3バイト文字（ひらがな・カタカナ・基本漢字・基本絵文字）
- ✅ 4バイト文字（サロゲートペア・国旗絵文字）

### 既知の制限

- 機種依存文字（①〜⑩等）は環境によって表示されない可能性あり
- 異体字セレクタ（IVS）はフォント依存
- 半角カナは入力時の変換ミスに注意

---

## ファイルパス一覧

| ファイル                                                            | 説明                               |
| :------------------------------------------------------------------ | :--------------------------------- |
| `src/i18n/japanese-charset.test.ts`                                 | テスト文字列セット定義             |
| `src/i18n/japanese-charset-validation.test.ts`                      | UTF-8検証テスト                    |
| `scripts/check-encoding.mjs`                                        | エンコーディング設定確認スクリプト |
| `server/security/mojibake-detector.ts`                              | 文字化け検出ユーティリティ         |
| `server/security/mojibake-detector.test.ts`                         | 文字化け検出テスト                 |
| `docs/development/2026-03-08-japanese-charset-test-deliverables.md` | 本ドキュメント                     |

---

## 変更履歴

| 日付       | 変更内容 |
| :--------- | :------- |
| 2026-03-08 | 初版作成 |

---

_本ドキュメントは開発チームの成果物です。他チームからのフィードバックをお待ちしております。_
