# Mobile Inbox & Watcher 仕様定義書

**作成日**: 2026-03-08
**作成者**: 企画チーム Clio
**ステータス**: Draft
**優先度**: Normal

---

## 1. 背景と目的

### 1.1 リクエスト概要（推定）

CEOからのリクエスト（文字化け復元推定）：

> **Mobile Inbox with Watcher機能の追加**
>
> Claw-Empireプロジェクトにモバイル向けDecision Inbox UIと、タスク監視機能（Watcher）を追加する。

### 1.2 現状分析

| 項目               | 現状                                       | 課題                                       |
| :----------------- | :----------------------------------------- | :----------------------------------------- |
| **Decision Inbox** | デスクトップ向けモーダルUIのみ実装         | モバイル画面での操作性が最適化されていない |
| **Watcher機能**    | WATCHDOG（タスク回復）はlifecycle.tsに存在 | ユーザー向けの監視UIは未実装               |
| **Mobile対応**     | AppHeaderBarにmobileメニューは実装済み     | InboxがデスクトップUIのまま                |

---

## 2. 既存Decision Inbox仕様

### 2.1 データ構造

```typescript
interface DecisionInboxItem {
  id: string;
  kind: "agent_request" | "project_review_ready" | "task_timeout_resume" | "review_round_pick";
  agentId: string | null;
  agentName: string;
  agentNameKo: string;
  agentAvatar?: string | null;
  requestContent: string;
  options: DecisionOption[];
  createdAt: number;
  taskId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
}
```

### 2.2 既存API

| エンドポイント                  | メソッド | 説明                 |
| :------------------------------ | :------- | :------------------- |
| `/api/decision-inbox`           | GET      | 未決アイテム一覧取得 |
| `/api/decision-inbox/:id/reply` | POST     | 意思決定返信         |

### 2.3 既存UI

- `DecisionInboxModal.tsx` - デスクトップ向け中央モーダル
- `AppHeaderBar.tsx` - 🧭 アイコンでアクセス
- モバイルでも表示されるが、レイアウトはデスクトップ指向

---

## 3. Mobile Inbox仕様（新規）

### 3.1 概要

モバイルデバイスでのDecision Inbox利用体験を最適化する専用UI。

### 3.2 UI/UX要件

#### レイアウト

- **フルスクリーン スライドアップ**: モバイルでは下からスライドアップするシート形式
- **カードベース**: 各アイテムはスワイプ可能なカード
- **フローティングアクションボタン（FAB）**: クイック更新用

#### 画面構成

```
┌─────────────────────────┐
│ 🧭 Pending Decisions (3) │ ← Header（固定）
├─────────────────────────┤
│ [スワイプで操作]          │
│ ┌─────────────────────┐ │
│ │ 🤖 Sage             │ │ ← Agent Avatar
│ │ プロジェクト判断     │ │ ← Kind Badge
│ │ ───────────────────  │ │
│ │ 要件定義完了の確認... │ │ ← Request Content（折りたたみ）
│ │ ───────────────────  │ │
│ │ [承認] [保留] [詳細]  │ │ ← Quick Actions
│ └─────────────────────┘ │
│ ...                     │
└─────────────────────────┘
```

#### インタラクション

- **プル・トゥ・リフレッシュ**: 最新アイテム取得
- **スワイプ操作**:
  - 右スワイプ → 承認
  - 左スワイプ → 詳細を開く
- **ロングプレス**: チャットを開く

### 3.3 技術仕様

| 項目                 | 仕様                                     |
| :------------------- | :--------------------------------------- |
| **ブレイクポイント** | `sm:` (640px) 未満でモバイルUI適用       |
| **コンポーネント**   | `DecisionInboxMobileSheet.tsx`（新規）   |
| **アニメーション**   | Framer Motionを使用したスライド/フェード |
| **タッチ操作**       | react-use-gestureでスワイプ検出          |

---

## 4. Watcher機能仕様（新規）

### 4.1 概要

特定のタスクやプロジェクトの状態変化を監視し、通知する機能。

### 4.2 機能要件

#### 監視対象

1. **タスク監視**: 特定タスクのステータス変化
2. **プロジェクト監視**: プロジェクト全体の進捗
3. **エージェント監視**: 特定エージェントの作業状態

#### 通知条件

| イベント             | 通知内容                                     |
| :------------------- | :------------------------------------------- |
| タスクステータス変更 | inbox → planned, in_progress → review → done |
| タスクタイムアウト   | 設定時間を超過                               |
| エージェント状態変化 | idle ↔ working ↔ break                       |
| 新しいDecision Inbox | 即時通知                                     |

### 4.3 UI仕様

#### Watcher設定パネル

- タスク詳細画面内に「監視を開始」トグル
- 監視中タスクの一覧表示

#### 通知UI

- トースト通知（リアルタイム）
- Decision Inboxへの統合（重要な状態変化）

### 4.4 データモデル（追加）

```typescript
interface WatcherSubscription {
  id: string;
  userId: string; // CEO/管理者
  targetType: "task" | "project" | "agent";
  targetId: string;
  events: WatcherEvent[];
  enabled: boolean;
  createdAt: number;
}

type WatcherEvent = "task_status_changed" | "task_timeout" | "agent_status_changed" | "decision_inbox_added";
```

### 4.5 技術仕様

| 項目           | 仕様                                                          |
| :------------- | :------------------------------------------------------------ |
| **配信方式**   | WebSocket既存インフラ活用 (`broadcast("watcher_event", ...)`) |
| **永続化**     | SQLite `watcher_subscriptions` テーブル（新規）               |
| **通知優先度** | Critical > High > Normal > Low                                |

---

## 5. 実装スコープ

### Phase 1: Mobile Inbox（MVP）

1. `DecisionInboxMobileSheet.tsx` コンポーネント実装
2. レスポンシブ切り替えロジック
3. 基本的なタッチ操作（タップ、スワイプ）

### Phase 2: Watcher基盤

1. `watcher_subscriptions` テーブル追加
2. WebSocketイベント配信ロジック
3. トースト通知UI

### Phase 3: 統合

1. Decision Inbox × Watcher 連携
2. 通知設定UI

---

## 6. 開発チームへの引き継ぎ項目

### 技術仕様書に必要な項目

- [ ] 対応OS・ブラウザ（モバイル：iOS Safari, Chrome Mobile）
- [ ] データ永続化方針（SQLiteスキーマ詳細）
- [ ] Watcherコンポーネントの詳細定義
- [ ] Claw-Empireプロジェクトとの連携仕様
- [ ] 既存コードベースのスコープ特定

### デザインチームへの引き継ぎ項目

- [ ] 画面遷移図・ワイヤーフレーム
- [ ] Watcher機能のUI表現方針
- [ ] カラーコンポーネント（DESIGN.md準拠）

### 品質管理チームへの引き継ぎ項目

- [ ] 受入テスト基準
- [ ] タッチ操作のテストシナリオ

---

## 7. 用語集

| 用語           | 説明                                                     |
| :------------- | :------------------------------------------------------- |
| Decision Inbox | エージェントからの意思決定要請を一覧表示する機能         |
| Watcher        | タスク/プロジェクト/エージェントの状態変化を監視する機能 |
| Mobile Sheet   | モバイルデバイスでの下からスライドアップするUIパターン   |

---

_次回: 開発チームによる技術レビュー後、各チーム詳細設計へ_
