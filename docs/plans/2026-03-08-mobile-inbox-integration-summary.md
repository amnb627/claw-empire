# Mobile Inbox & Watcher プロジェクト 統合サマリー

**作成日**: 2026-03-08
**作成者**: インフラセキュリティチーム Pipe
**ステータス**: Draft
**対象**: 全チーム

---

## 1. プロジェクト概要

Mobile Inbox & Watcher機能の追加に伴う、企画・開発・デザイン・品質管理・インフラセキュリティ・運営各チームの成果物統合レポート。

---

## 2. 成果物一覧

### 2.1 企画チーム（Clio）

| ファイル                                  | 説明                 |
| :---------------------------------------- | :------------------- |
| `2026-03-08-mobile-inbox-watcher-spec.md` | 機能仕様定義書       |
| `2026-03-08-request-decoding-report.md`   | 文字化け解析レポート |

**主要内容**:

- Mobile Inbox UI/UX仕様（フルスクリーンスライドアップ、カードベース）
- Watcher機能仕様（タスク/プロジェクト/エージェント監視）
- データモデル定義（`WatcherSubscription`, `WatcherEvent`）
- 実装スコープPhase定義

### 2.2 インフラセキュリティチーム（Pipe）

| ファイル                                             | 説明                           |
| :--------------------------------------------------- | :----------------------------- |
| `2026-03-08-mobile-inbox-security-infrastructure.md` | セキュリティインフラ仕様書     |
| `.github/workflows/watcher-security-scan.yml`        | CI/CDセキュリティスキャン      |
| `server/security/watcher/authorization.test.ts`      | 認可ロジックテストテンプレート |

**主要内容**:

- 認証・認可モデル（CEO/TeamLeader/Agentロール階層）
- 既存インフラ統合（WebSocket拡張、SQLiteスキーマ追加）
- デプロイ環境技術仕様
- CI/CDパイプライン強化（7種類のセキュリティテスト）

---

## 3. 技術仕様統合

### 3.1 データベーススキーマ

```sql
-- 既存: agents, tasks, messages, decision_inbox_states
-- 新規追加:

CREATE TABLE watcher_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_role TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  events TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE watcher_notification_logs (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES watcher_subscriptions(id) ON DELETE CASCADE
);
```

### 3.2 APIエンドポイント

| エンドポイント                  | メソッド | 認証 | 説明                   |
| :------------------------------ | :------- | :--- | :--------------------- |
| `/api/decision-inbox`           | GET      | 必須 | 既存：未決アイテム一覧 |
| `/api/decision-inbox/:id/reply` | POST     | 必須 | 既存：意思決定返信     |
| `/api/watcher/subscribe`        | POST     | 必須 | 新規：Watcher登録      |
| `/api/watcher/:id`              | DELETE   | 必須 | 新規：Watcher解除      |
| `/api/watcher/subscriptions`    | GET      | 必須 | 新規：登録一覧         |

### 3.3 WebSocketイベント

```typescript
// 既存イベント
type ExistingEvent = "agent_status" | "announcement" | "cli_output" | "new_message" | "task_update" | "subtask_update";

// 新規追加
type WatcherEvent = "watcher_event";

// ペイロード
interface WatcherEventPayload {
  subscriptionId: string;
  eventType: "task_status_changed" | "task_timeout" | "agent_status_changed" | "decision_inbox_added";
  targetType: "task" | "project" | "agent";
  targetId: string;
  timestamp: number;
  data: unknown;
}
```

---

## 4. セキュリティ統合

### 4.1 認可マトリックス

| ロール          | タスク監視 | プロジェクト監視 | エージェント監視 |
| :-------------- | :--------- | :--------------- | :--------------- |
| **CEO**         | 全て       | 全て             | 全て             |
| **Team Leader** | 自部門のみ | 自部門のみ       | 自部門のみ       |
| **Agent**       | 自分のみ   | 不可             | 不可             |

### 4.2 監査ログ

| 操作         | 監査レベル | 記録先                                                |
| :----------- | :--------- | :---------------------------------------------------- |
| Watcher登録  | HIGH       | `security-audit.ndjson` + `watcher_notification_logs` |
| Watcher解除  | NORMAL     | `watcher_notification_logs`                           |
| 通知配信     | NORMAL     | `watcher_notification_logs`                           |
| 不正アクセス | CRITICAL   | `security-audit.ndjson`                               |

---

## 5. 実装ロードマップ

### Phase 1: 基盤整備（Week 1-2）

- [ ] `watcher_subscriptions`テーブル追加
- [ ] 認可関数実装
- [ ] WebSocket `watcher_event`拡張

### Phase 2: UI実装（Week 3-4）

- [ ] `DecisionInboxMobileSheet.tsx`実装
- [ ] Watcher設定パネル実装
- [ ] トースト通知UI実装

### Phase 3: 統合・テスト（Week 5-6）

- [ ] Decision Inbox × Watcher連携
- [ ] CI/CDセキュリティスキャン有効化
- [ ] E2Eテスト実施

---

## 6. 各チーム次回アクション

| チーム             | アクション                     |
| :----------------- | :----------------------------- |
| **開発チーム**     | `authorization.ts`実装開始     |
| **デザインチーム** | モバイルUIワイヤーフレーム作成 |
| **品質管理チーム** | E2Eテストシナリオ策定          |
| **運営チーム**     | リリース後監視体制設計         |

---

## 7. リスク管理

| リスク                  | 影響 | 緩和策                     |
| :---------------------- | :--- | :------------------------- |
| WebSocketセッション固定 | 中   | セッションタイムアウト実装 |
| 監査ログ改ざん          | 高   | チェーンハッシュ検証       |
| 認可バイパス            | 高   | 単体テストカバレッジ100%   |
| 通知配信遅延            | 中   | パフォーマンスモニタリング |

---

_統合完了 - レビュー待ち_
