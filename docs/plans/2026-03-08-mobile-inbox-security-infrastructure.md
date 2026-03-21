# Mobile Inbox & Watcher セキュリティインフラ仕様書

**作成日**: 2026-03-08
**作成者**: インフラセキュリティチーム Pipe
**ステータス**: Draft
**優先度**: Normal
**関連仕様**: `2026-03-08-mobile-inbox-watcher-spec.md`

---

## 1. はじめに

### 1.1 ドキュメント目的

本ドキュメントはMobile InboxおよびWatcher機能の追加に伴うセキュリティ要件、インフラ統合、デプロイ環境の技術仕様を定義する。

### 1.2 既存インフラ分析

| コンポーネント   | 既存実装                                                | Watcher統合への影響                     |
| :--------------- | :------------------------------------------------------ | :-------------------------------------- |
| **WebSocket**    | `ws`パッケージ、broadcastイベント配信                   | `watcher_event`種別を追加               |
| **認証**         | `server/security/auth.ts`（Origin検証、メッセージ認証） | Watcher通知配信時に適用                 |
| **監査ログ**     | `security-audit.ts`（チェーンハッシュ、NDJSON）         | Watcher操作を監査対象に追加             |
| **データベース** | SQLite、`tasks`/`agents`テーブル                        | `watcher_subscriptions`テーブル新規追加 |
| **APIルート**    | `/api/decision-inbox`                                   | `/api/watcher/*`ルート追加              |

---

## 2. Watcher セキュリティ要件定義

### 2.1 認証・認可モデル

#### 2.1.1 ロール階層

```
CEO (Owner)
    └── 監視可能: 全タスク/プロジェクト/エージェント
Department Lead (Team Leader)
    └── 監視可能: 自部門タスク/プロジェクト/自部門エージェント
Agent (Worker)
    └── 監視可能: 自タスクのみ
```

#### 2.1.2 認可フロー

```typescript
interface WatcherAuthorizationContext {
  userId: string;
  userRole: "ceo" | "team_leader" | "agent";
  departmentId: string | null;
  agentId: string | null;
}

interface WatcherSubscriptionRequest {
  targetType: "task" | "project" | "agent";
  targetId: string;
  events: WatcherEvent[];
}

// 認可チェックロジック
function authorizeWatcherSubscription(
  ctx: WatcherAuthorizationContext,
  req: WatcherSubscriptionRequest,
): { allowed: boolean; reason?: string } {
  // CEOは全許可
  if (ctx.userRole === "ceo") return { allowed: true };

  // Team Leaderは自部門内リソースのみ
  if (ctx.userRole === "team_leader") {
    const targetDept = getDepartmentId(req.targetType, req.targetId);
    if (targetDept === ctx.departmentId) return { allowed: true };
    return { allowed: false, reason: "cross_department_not_allowed" };
  }

  // Agentは自タスクのみ
  if (ctx.userRole === "agent") {
    if (req.targetType === "task" && req.targetId === ctx.agentId) {
      return { allowed: true };
    }
    return { allowed: false, reason: "insufficient_privileges" };
  }

  return { allowed: false, reason: "unknown_role" };
}
```

### 2.2 監査要件

| 操作                 | 監査レベル | 記録項目                                              |
| :------------------- | :--------- | :---------------------------------------------------- |
| **Watcher登録**      | HIGH       | `user_id`, `target_type`, `target_id`, `events`, `ip` |
| **Watcher解除**      | NORMAL     | `user_id`, `subscription_id`, `ip`                    |
| **通知配信**         | NORMAL     | `subscription_id`, `event_type`, `recipient_count`    |
| **不正アクセス試行** | CRITICAL   | `user_id`, `target`, `reason`, `ip`, `user_agent`     |

### 2.3 セキュリティ境界

#### 2.3.1 WebSocket認証

```typescript
// 既存 `isIncomingMessageAuthenticated` を拡張
interface WebSocketAuthContext {
  sessionId: string;
  userId: string;
  subscriptions: string[]; // Watcher subscription IDs
  authenticatedAt: number;
  lastActivityAt: number;
}

// セッションタイムアウト: 30分無操作で自動切断
const WEBSOCKET_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Watcher通知配信時の認証チェック
function canSendWatcherNotification(ctx: WebSocketAuthContext, subscriptionId: string): boolean {
  if (!ctx.subscriptions.includes(subscriptionId)) return false;
  if (nowMs() - ctx.lastActivityAt > WEBSOCKET_SESSION_TIMEOUT_MS) return false;
  return true;
}
```

#### 2.3.2 APIレート制限

| エンドポイント                   | 制限       | 理由               |
| :------------------------------- | :--------- | :----------------- |
| `POST /api/watcher/subscribe`    | 10 req/min | 登録爆発的増加防止 |
| `DELETE /api/watcher/:id`        | 60 req/min | 通常操作範囲       |
| `GET /api/watcher/subscriptions` | 60 req/min | 通常操作範囲       |

---

## 3. 既存インフラとの統合範囲

### 3.1 データベーススキーマ追加

```sql
-- watcher_subscriptions テーブル
CREATE TABLE IF NOT EXISTS watcher_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_role TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  events TEXT NOT NULL, -- JSON配列: '["task_status_changed","task_timeout"]'
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- パフォーマンス最適化インデックス
  FOREIGN KEY (user_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_watcher_user ON watcher_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_watcher_target ON watcher_subscriptions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_watcher_enabled ON watcher_subscriptions(enabled) WHERE enabled = 1;

-- watcher_notification_log テーブル（監査用）
CREATE TABLE IF NOT EXISTS watcher_notification_logs (
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

### 3.2 WebSocketイベント拡張

```typescript
// 既存 broadcast 関数に watcher_event を追加
// server/index.ts の broadcast定義箇所

type WatcherEventPayload = {
  subscriptionId: string;
  eventType: WatcherEvent;
  targetType: "task" | "project" | "agent";
  targetId: string;
  timestamp: number;
  data: unknown;
};

// 既存イベント種別に追加
// serverBroadcasts: [...existing..., "watcher_event"]
```

### 3.3 既存ルート統合

| 既存ルート            | Watcher連携                              |
| :-------------------- | :--------------------------------------- |
| `/api/tasks/:id`      | タスクステータス変更時 → Watcher通知配信 |
| `/api/agents/:id`     | エージェント状態変化時 → Watcher通知配信 |
| `/api/decision-inbox` | 新規Decision追加時 → Watcher通知配信     |

---

## 4. デプロイ環境技術仕様

### 4.1 環境変数追加

```bash
# .env.example に追加

# Watcher機能設定
WATCHER_ENABLED=true
WATCHER_MAX_SUBSCRIPTIONS_PER_USER=100
WATCHER_NOTIFICATION_RETENTION_DAYS=30

# WebSocket設定
WS_HEARTBEAT_INTERVAL_MS=30000
WS_SESSION_TIMEOUT_MS=1800000

# セキュリティ設定
WATCHER_AUDIT_ENABLED=true
WATCHER_RATE_LIMIT_ENABLED=true
```

### 4.2 デプロイ構成

#### 4.2.1 ローカル開発環境

```yaml
# docker-compose.dev.yml
services:
  claw-empire:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - WATCHER_ENABLED=true
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
```

#### 4.2.2 本番環境（レプリケーション対応）

```yaml
# 本番構成の考慮事項
# - WebSocket Sticky Session対応
# - SQLiteファイルの共有ストレージ
# - 監査ログの集約配信

考慮事項:
  1. 複数プロセス間でのWatcher通知同期:
    - SQLiteファイルロック機材活用
    - またはpub/subメッセージブローカー導入（Redis等）

  2. 監査ログの集約:
    - security-audit.ndjson を中央ログ基盤へ転送
    - SIEMツール連携（Wazuh等）
```

### 4.3 CI/CDパイプライン強化

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on: [pull_request, push]

jobs:
  watcher-security:
    runs-on: ubuntu-latest
    steps:
      - name: WebSocketメッセージ注入テスト
        run: npm run test:websocket-fuzzing

      - name: Watcher認可バイパス検証
        run: npm run test:watcher-authorization

      - name: 監査ログ完全性チェック
        run: npm run test:audit-chain-integrity
```

---

## 5. コンテナオーケストレーション準備

### 5.1 コンテナ化要件

| 項目               | 要件                        |
| :----------------- | :-------------------------- |
| **ベースイメージ** | `node:22-alpine`            |
| **非rootユーザー** | `node` ユーザーで実行       |
| **ヘルスチェック** | `/healthz` エンドポイント   |
| **ログ出力**       | stdout/stderr（構造化JSON） |

### 5.2 Kubernetesマニフェスト（準備）

```yaml
# deployment.yaml (将来追加)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claw-empire
spec:
  replicas: 2
  selector:
    matchLabels:
      app: claw-empire
  template:
    metadata:
      labels:
        app: claw-empire
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: app
          image: claw-empire:latest
          ports:
            - containerPort: 3000
          env:
            - name: WATCHER_ENABLED
              value: "true"
          volumeMounts:
            - name: data
              mountPath: /app/data
            - name: logs
              mountPath: /app/logs
          livenessProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /healthz
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: claw-empire-data
        - name: logs
          persistentVolumeClaim:
            claimName: claw-empire-logs
```

### 5.3 WebSocket対応

```yaml
# service.yaml (Sticky Session対応)
apiVersion: v1
kind: Service
metadata:
  name: claw-empire
spec:
  selector:
    app: claw-empire
  ports:
    - port: 3000
  sessionAffinity: ClientIP # WebSocketセッション維持
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600
```

---

## 6. セキュリティチェックリスト

### 6.1 実装前確認

- [ ] `watcher_subscriptions`テーブルのユニーク制約定義
- [ ] 認可関数の単体テストカバレッジ100%
- [ ] WebSocketセッションタイムアウト実装
- [ ] 監査ログ連鎖ハッシュ検証

### 6.2 デプロイ前確認

- [ ] 環境変数 `WATCHER_ENABLED` のデフォルト値確認
- [ ] レート制限の負荷試験
- [ ] 監査ログのローテーション設定
- [ ] 非rootユーザー実行検証

### 6.3 運用後監視

| メトリクス           | 警告閾値 | 対応              |
| :------------------- | :------- | :---------------- |
| Watcher登録失敗率    | >5%      | 認可ロジック確認  |
| 通知配信遅延         | >5秒     | WebSocket負荷調査 |
| 監査ログ書き込み失敗 | 0件      | 即時アラート      |

---

## 7. 開発チームへの引き継ぎ事項

### 7.1 実装優先順位

1. **Phase 1**: セキュリティ境界実装
   - 認可関数 `authorizeWatcherSubscription`
   - `watcher_subscriptions`テーブル追加

2. **Phase 2**: 通知配信インフラ
   - WebSocket `watcher_event` 拡張
   - 監査ログ連携

3. **Phase 3**: CI/CD統合
   - セキュリティスキャン追加
   - コンテナ化準備

### 7.2 依存関係

| 項目                | 依存先                  | ステータス  |
| :------------------ | :---------------------- | :---------- |
| Watcherデータモデル | 企画チーム仕様          | ✅ 完了     |
| 認可ロジック        | 既存`security/auth.ts`  | ✅ 利用可能 |
| WebSocket配信       | 既存`ws`インフラ        | ✅ 拡張可能 |
| 監査ログ            | 既存`security-audit.ts` | ✅ 連携可能 |

---

## 8. 用語集

| 用語                  | 説明                                             |
| :-------------------- | :----------------------------------------------- |
| 認可（Authorization） | リソースへのアクセス権限チェック                 |
| 監査ログチェーン      | 前レコードハッシュを含む改ざん検出構造           |
| Sticky Session        | WebSocket接続を同一Podに維持するセッション親和性 |
| レート制限            | API呼出し回数の制限機材                          |

---

_次回: 開発チームによる実装後、セキュリティ監査を実施_
