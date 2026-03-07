# Watcher コンポーネント詳細定義書

**作成日**: 2026-03-08
**担当**: Development Team (Bolt)
**関連ファイル**: `server/modules/routes/ops/messages/decision-inbox-routes.ts`

---

## 1. 概要

Watcherコンポーネントは、DecisionInbox内の未決アイテムを監視し、必要に応じて自動処理を行うバックグラウンドプロセスである。

---

## 2. アーキテクチャ

### 2.1 コンポーネント構成

```
┌─────────────────────────────────────────────────────────────┐
│                    Watcher System                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ YOLO Mode   │───>│ State Query  │───>│ Auto Reply   │  │
│  │ Detector    │    │ (getItems)   │    │ Executor     │  │
│  └─────────────┘    └──────────────┘    └──────────────┘  │
│         │                                      │            │
│         v                                      v            │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Skip Logic  │    │ Messenger    │    │ Broadcast    │  │
│  │ (video_     │    │ Notification │    │ (WebSocket)  │  │
│  │  preprod)   │    │              │    │              │  │
│  └─────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 タイミング仕様

| パラメータ | 値 | 説明 |
|:----------|:---|:-----|
| ポーリング間隔 | 2.5秒 | `setInterval(..., 2500)` |
| 初回遅延 | 1.2秒 | `setTimeout(..., 1200)` |
| 実行中ロック | 有効 | `yoloAutopilotInFlight` フラグ |

---

## 3. YOLO (You Only Live Once) オートパイロット

### 3.1 機能説明

YOLOモードが有効な場合、Watcherは以下の自動処理を実行：

1. DecisionInboxアイテム取得
2. スキップ条件チェック
3. 自動返信実行
4. メッセンジャー通知送信

### 3.2 実装コード

```typescript
const runYoloAutopilot = () => {
  if (yoloAutopilotInFlight) return;
  if (!readYoloModeEnabled(db)) return;
  yoloAutopilotInFlight = true;
  try {
    runYoloDecisionAutopilot({
      getDecisionInboxItems,
      applyDecisionReply,
      shouldSkipItem: (item) => {
        // スキップロジック
        if (item.kind === "review_round_pick" && item.task_id) {
          const row = db.prepare(
            "SELECT workflow_pack_key FROM tasks WHERE id = ? LIMIT 1"
          ).get(item.task_id);
          return row?.workflow_pack_key === "video_preprod";
        }
        if (item.kind === "project_review_ready" && item.project_id) {
          const recentHold = db.prepare(/* ... */).get(item.project_id, nowMs() - 120_000);
          if (recentHold) return true;
        }
        return false;
      },
    });
  } catch (err) {
    console.warn(`[decision-yolo] autopilot failed: ${String(err)}`);
  } finally {
    yoloAutopilotInFlight = false;
  }
};
```

### 3.3 スキップ条件

| 条件 | 対象 kind | 説明 |
|:-----|:----------|:-----|
| `workflow_pack_key === "video_preprod"` | `review_round_pick` | 動画制作パックは手動決定 |
| レビューホールド直後(2分以内) | `project_review_ready` | アーティファクトゲートブロック中 |

---

## 4. 状態管理

### 4.1 データベーステーブル

```sql
-- 決定状態管理
CREATE TABLE IF NOT EXISTS decision_inbox_state (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- プロジェクトレビュー状態
CREATE TABLE IF NOT EXISTS project_review_decision_state (
  project_id TEXT NOT NULL PRIMARY KEY,
  snapshot_hash TEXT NOT NULL,
  state_json TEXT NOT NULL,
  events_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- レビューラウド状態
CREATE TABLE IF NOT EXISTS review_round_decision_state (
  task_id TEXT NOT NULL PRIMARY KEY,
  snapshot_hash TEXT NOT NULL,
  state_json TEXT NOT NULL,
  events_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 4.2 ステートヘルパー関数

| 関数 | 説明 |
|:-----|:-----|
| `getProjectReviewDecisionState()` | プロジェクトレビュー状態取得 |
| `upsertProjectReviewDecisionState()` | プロジェクトレビュー状態更新 |
| `getReviewRoundDecisionState()` | レビューラウンド状態取得 |
| `upsertReviewRoundDecisionState()` | レビューラウンド状態更新 |
| `recordProjectReviewDecisionEvent()` | 決定イベント記録 |
| `buildProjectReviewSnapshotHash()` | スナップショットハッシュ生成 |

---

## 5. メッセンジャー連携

### 5.1 対応プラットフォーム

| プラットフォーム | ステータス | ファイル |
|:----------------|:----------|:---------|
| Telegram | ✅ 実装済み | `server/messenger/telegram-receiver.ts` |
| Discord | ✅ 実装済み | `server/messenger/discord-receiver.ts` |

### 5.2 Messenger Bridge

**場所**: `server/modules/routes/ops/messages/decision-inbox/messenger-bridge.ts`

```typescript
export function createDecisionInboxMessengerBridge({
  db,
  nowMs,
  getPreferredLanguage,
  normalizeTextField,
  getDecisionInboxItems,
  applyDecisionReply,
}: MessengerBridgeInput): {
  tryHandleInboxDecisionReply: (input: DecisionReplyBridgeInput) => Promise<DecisionReplyBridgeResult>;
  flushDecisionInboxMessengerNotices: (opts: { force: boolean }) => Promise<FlushResult>;
  startBackgroundNoticeSync: () => void;
}
```

### 5.3 通知フォーマット

**場所**: `server/modules/routes/ops/messages/decision-inbox/messenger-notice-format.ts`

メッセンジャー向けに整形された通知メッセージ生成機能。

---

## 6. API インターフェース

### 6.1 DecisionInbox 取得

```
GET /api/decision-inbox
Query Parameters:
  - force: "1" | "true" | "yes" (強制再送)

Response:
{
  "items": DecisionInboxRouteItem[]
}
```

### 6.2 決定返信

```
POST /api/decision-inbox/:id/reply
Body:
{
  "option_number": number,
  "note"?: string,
  "selected_option_numbers"?: number[]
}

Response:
{
  "ok": true | false,
  "error"?: string
}
```

---

## 7. エラーハンドリング

| エラーコード | HTTP Status | 説明 |
|:-------------|:------------|:-----|
| `option_number_required` | 400 | オプション番号未指定 |
| `decision_not_found` | 404 | 決定アイテム不存在 |
| `decision_options_not_ready` | 409 | 選択肢準備未完了 |
| `option_not_found` | 400 | 指定オプション不存在 |
| `unknown_decision_id` | 400 | 不明な決定ID |

---

## 8. パフォーマンス考慮事項

### 8.1 最適化済み項目

- DBクエリ準備済みステートメント使用
- 重複実行防止（`yoloAutopilotInFlight`）
- タイマーアンラッフ（`unref()`）によるイベントループブロック回避

### 8.2 スケーラビリティ

- SQLiteベースのため、単一インスタンス運用
- 将来的な水平スケーリングにはPostgreSQL等への移行が必要

---

## 9. セキュリティ考慮事項

### 9.1 認証・認可

- 現状、CEO権限での実行を前提
- APIエンドポイントへのアクセス制限は未実装（ローカルファースト設計）

### 9.2 推奨事項

- APIエンドポイントに認証ミドルウェア追加
- Messenger連携時のトークン管理強化
- 決定実行権限のRBAC実装

---

## 10. 将来拡張項目

| 優先度 | 機能 | 説明 |
|:-------|:-----|:-----|
| High | 複数決定一括処理 | 複数アイテムの一括承認/却下 |
| Medium | 通知設定個別化 | kind別通知ON/OFF |
| Low | 予測的決定推奨 | MLベースの推奨オプション提示 |

---

**付録: 関連型定義**

```typescript
interface DecisionInboxRouteItem {
  id: string;
  kind: DecisionInboxKind;
  agent_id: string | null;
  agent_name: string;
  agent_name_ko: string;
  agent_avatar: string | null;
  summary: string;
  created_at: number;
  task_id: string | null;
  project_id: string | null;
  project_name: string | null;
  options: DecisionOption[];
}

type DecisionInboxKind =
  | "agent_request"
  | "project_review_ready"
  | "task_timeout_resume"
  | "review_round_pick";

interface DecisionOption {
  number: number;
  label: string | null;
  action: string;
}
```
