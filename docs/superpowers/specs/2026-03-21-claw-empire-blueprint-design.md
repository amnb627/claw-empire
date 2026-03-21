# Claw Empire — Strategic Blueprint v1.0

**Date**: 2026-03-21
**Method**: 3 parallel Sonnet subagents (Architecture / Product / Integration) → synthesis
**Status**: DRAFT — Awaiting user approval

---

## 一言サマリー

Claw Empire は「**Parallel Dispatch Layer**」として進化する：永続セッション（5つのターミナル）ではカバーできない、境界が明確で並列化可能なタスクを AI エージェントへ委譲する専用基盤。その中核となる賭けは**ユーザー定義ワークフローパック**で、施設訪問準備・メール返信・ZK文献ノートの3つのドメイン特化パックを Phase 1 で実装することで「daily driver」化する。

---

## Part 1: アーキテクチャ Blueprint（Architecture Agent 分析）

### 現状スタック評価

```
Browser (React 19 + PixiJS 8)
  ↕ HTTP REST + WebSocket
Express 5 + SQLite (node:sqlite 同期API)
  ↕ child_process.spawn()
CLI Agents (claude / codex / gemini)
  → git worktrees (.climpire-worktrees/{8-char-id}/)
```

**評点**: テスト442本、22テーブルスキーマ、WALモード、適切なFK制約 — 現状は堅固。ただし3つのタイムボムが埋まっている。

---

### 🔴 リスク Top 3

#### Risk 1: CLI ゾンビプロセス（最優先修正）

**シナリオ**: Express サーバーがクラッシュ → `activeProcesses` Map が消滅 → `detached: true` の claude プロセスが動き続ける → API トークン消費 + worktree に変更が蓄積 → サーバー再起動後に孤立タスクが再実行されトークン2倍消費。

**根本原因**: PID が DB に永続化されていない（`active_cli_processes` テーブル未存在）。

**修正**: 新テーブル追加 + 起動時リコンシリエーション

```sql
CREATE TABLE active_cli_processes (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  pid INTEGER NOT NULL,
  provider TEXT NOT NULL,
  worktree_path TEXT,
  spawned_at INTEGER NOT NULL
);
```

起動時に `isPidAlive(pid)` チェック → alive なら kill → worktree 削除 → task を `inbox` にリセット。

#### Risk 2: イベントループブロッキング（concurrent 5+ タスク時）

**シナリオ**: 5タスクが同時完了 → `handleTaskRunComplete()` が同期的に11+ DB操作 × 5回 = 最大250ms のイベントループブロック → WebSocket heartbeat 停止 → フロントエンドがフリーズ。

**修正**: `DatabaseSync` の DB 操作を Worker Thread に移動してイベントループを解放。または `better-sqlite3` の async API に移行。

#### Risk 3: `runtimeContext` 型安全性ブラックホール

**シナリオ**: `createRunCompleteHandler(deps: Record<string, any>)` — 40+の依存関係がすべて `any` 型。新しい依存追加時に TypeScript がミス配線を検出できず、runtime で `TypeError: deps.xxx is not a function` が発生し、タスクが永久に `in_progress` のまま固まる。

**修正**: `CreateRunCompleteHandlerDeps` を完全型付きインターフェースに変換（`cross-dept-cooperation.ts` で行った移行の延長線）。

---

### 🟢 アーキテクチャ改善 Top 3

| #   | 改善内容                                 | 優先度   | 工数目安 |
| --- | ---------------------------------------- | -------- | -------- |
| 1   | PID永続化 + 起動時クラッシュリカバリ     | **即時** | ~50行    |
| 2   | RuntimeContext 完全型付き + 段階的初期化 | 高       | ~2日     |
| 3   | ワークフローパック DB駆動バリデーション  | 高       | ~半日    |

**パック拡張修正の核心**:

```typescript
// 現状: ハードコードされた const tuple
const WORKFLOW_PACK_KEYS = ["development", "novel", ...] as const;

// 修正後: DB から動的に読み込む Set
let _runtimePackKeys: Set<string> = new Set(BUILTIN_PACK_KEYS);
export function initPackRegistry(db: DbLike): void {
  const rows = db.prepare("SELECT key FROM workflow_packs WHERE enabled = 1").all();
  _runtimePackKeys = new Set([...BUILTIN_PACK_KEYS, ...rows.map(r => r.key)]);
}
```

これだけで **ユーザー定義パックが完全動作**。ストレージ層はすでに対応済み。

---

### 🚀 ムーンショット: エージェント・スキル記憶

`skill_learning_history` テーブルは**すでにスキーマに存在するが未活用**。タスク完了後に「このプロジェクトで成功したアプローチ」を構造化して保存し、次回タスク起動時にシステムプロンプトへ注入する：

```
「このプロジェクトで学んだこと:
- テストは pnpm test:api で実行
- 新モジュールは server/modules/ 配下
- vitest.config.ts の --config フラグ必須
- 先週の CS4DFlow タスク: 兵藤先生は英語対応可」
```

これが実現すると、エージェントが「このプロジェクトと施設を何ヶ月も担当しているチームメンバー」として機能する。他のAIオーケストレーターにはない機能。

---

### ✅ 変えてはいけないもの

- **SQLite**: WAL + 5秒タイムアウト + リトライ = 現状で正しい。PostgreSQL化は不要（ローカルファースト前提が崩れる時まで）
- **モノリス**: CLI プロセス管理とオーケストレーターは同一プロセス内にあるべき。マイクロサービス化は逆行
- **spawn + stdin**: すべてのCLIプロバイダーの共通インターフェース。変える理由なし
- **git worktree 戦略**: 並列タスクの安全な隔離として production-grade。維持
- **WebSocket イベントモデル**: `cli_output`/`task_update`/`agent_status` の分類は clean。SSEやポーリングへの移行は不要

---

## Part 2: プロダクト戦略 Blueprint（Product Agent 分析）

### コアバリュープロポジション再定義

**× 「AIオフィスシミュレーター」**（チャーミングだが power user には wrong frame）
**× 「タスクオーケストレーター」**（undervalues the real advantage）
**○ 「Parallel Dispatch Layer」**

真の問いは: 「永続セッションでカバーできない、**境界が明確で並列化可能な作業単位**を、いかに速く・安全に・観察可能な形でファンアウトできるか？」

**重要な境界線**:

- Claw Empire が担う: 短命・境界明確・並列化可能なタスク
- 5つのターミナルが担う: 深い・反復的・文脈豊富なスレッド

---

### 永続セッション統合は追わない

「セッション引き継ぎ」や「セッション連携」機能は建築的トラップ。エフェメラルな会話履歴・ファイルハンドル・内部ツール状態は外部プロセスからは信頼できない形では読めない。

**正しいインターフェース**:

1. **Output injection**: タスク出力を well-known パスに書き込み → 永続セッションが読む（`projectPath` 活用）
2. **Inbox webhook**: 永続セッション内の Claude Code から `curl` でタスクを Claw Empire に dispatch できる（`AGENTS.md` に記載済み、もっと前面に出すべき）

---

### PixiJS オフィスビュー: 意味的密度を高める

削除はしない。ただし現在のアニメーションは装飾的すぎる。`cli_output` のストリーミング量と連動させる。部門間の配送アニメーションはマルチエージェントチェーンの可視化として有用 — もっと使う。

---

### Kill List（即時無効化）

- `roleplay` パック: `enabled: 0` に設定
- `novel` パック: `enabled: 0` に設定
  理由: オーナーが使用しない、プロのツールとしての positioning を希薄化、ルーティング分類器の誤差面を拡大。コードは残す（上流フォークとの互換性）、UIには表示しない。

---

### メンタルモデル修正

**× 「上司が部下に指示」**（曖昧なタスク記述を誘発し、品質低下）
**○ 「ディスパッチャーがスペシャリストを調整」**

UX への影響:

- タスク作成はフリーテキストではなく、パック定義の入力スキーマに基づく構造化フォームにする
- XP計算に「初回合格ボーナス」を追加: レビューループなしで `done` になったタスクに追加XP

---

### 3フェーズロードマップ「daily driver 化」

#### Phase 1 — Dispatch Plumbing（Week 1-5）

_目標: 本物のタスクを信頼して委譲できる信頼性_

- [ ] **Pack Editor v1**: テキストフィールドベースのパック作成UI（設定画面に「Workflow Packs」タブ）
- [ ] **構造化タスク作成フォーム**: パック定義の inputSchema に基づくフィールド入力 → プロンプトテンプレートへの自動注入
- [ ] **roleplay/novel パック無効化**
- [ ] **Output path 規約**: すべてのタスクが `projectPath` 相対の予測可能なパスに出力を書く → Claude Code セッションへの output injection が機能する
- [ ] **XP 初回合格ボーナス**: `in_progress → done` の直接遷移に追加XP

**成功指標**: 週3件の実業務タスク（訪問準備・メール下書き・ZK文献ノート）を Claw Empire 経由で委譲。現在のベースライン: 0件。

#### Phase 2 — Context Richness（Week 6-10）

_目標: 永続セッション並みの文脈なしに高品質な出力を得る_

- [ ] **Context snapshot injection**: dispatch 時に参照ファイルリストを指定 → プロンプトに自動注入
- [ ] **パックテンプレート変数**: `file_content` 型フィールドでファイル内容をプロンプトへ
- [ ] **Linear task chaining**: `feeds_into` によるタスク直列チェーン（2タスクのみ、DAGは不要）
- [ ] **Decision Inbox 優先表示**: ブロック中タスクをより prominently に表示、シングルクリック承認

**成功指標**: 初回合格率 70%+。施設訪問準備 dispatch 60秒以内。

#### Phase 3 — Intelligence Layer（Week 11-16）

_目標: 能動的に有用なシステムへ_

- [ ] **Scheduled task triggers**: cron形式で訪問3日前に `facility_visit` タスク自動生成
- [ ] **Pack performance analytics**: パック別初回合格率・平均実行時間・QAゲート失敗理由
- [ ] **Peer review meeting type**: Agent A 下書き → Agent B（別プロバイダー）がQAルールに対して批評 → Agent A 1回修正
- [ ] **エージェント・スキル記憶**: `skill_learning_history` テーブルを活用した文脈注入

**成功指標**: 週1件のスケジュールトリガータスク自動生成。コアパック3つで80%+ 初回合格率。

---

### KPI ダッシュボード

| 指標                       | 現在   | Phase 1 目標     | Phase 3 目標 |
| -------------------------- | ------ | ---------------- | ------------ |
| 実業務タスク/週            | 0      | 3                | 10           |
| 初回合格率                 | 未計測 | ベースライン取得 | 80%          |
| 構造化タスク dispatch 時間 | ~180秒 | <60秒            | <30秒        |
| ユーザー定義パック数       | 0      | 3                | 8            |

---

## Part 3: ワークフロー統合 Blueprint（Integration Agent 分析）

### 3大高価値統合ポイント

#### 統合 1: メール ACTION → Claw Empire タスクキュー

**価値**: 毎朝のハブファイル目視スキャン → Claw Empire inbox の構造化トリアージ

**実装**: `04_Output/03_Tools/inbox_to_claw.py`（新規作成）

```python
# 核心ロジック
def push_actions_to_claw(classification_json_path):
    data = json.loads(Path(classification_json_path).read_text('utf-8'))
    actions = [e for e in data['emails'] if e['classification'] == 'ACTION']

    for action in actions:
        dedup = hashlib.md5(
            f"{action['subject'][:80]}|{action['from']}|{action['date'][:10]}".encode()
        ).hexdigest()

        # 重複チェック後 POST /api/tasks
        project_id = FACILITY_PROJECT_MAP.get(action.get('facility'))
        payload = {
            "title": f"[{action.get('facility','?')}] {action['subject'][:120]}",
            "task_type": "analysis",
            "workflow_pack_key": "report",
            "priority": 3 if action.get('urgency') == 'high' else 1,
            "status": "inbox",
            "project_id": project_id,
            "workflow_meta_json": json.dumps({"source":"email","dedup_key": dedup, ...})
        }
        requests.post(f"{API}/api/tasks", json=payload,
                     headers={"Authorization": f"Bearer {TOKEN}"}, timeout=10)
```

`daily_pipeline.py` の step 5 として追加（接続エラーはキャッチしてパイプラインをブロックしない）。

#### 統合 2: `facility_visit` ワークフローパック

**価値**: W13 訪問準備（手動 4リビジョン）→ Claw Empire タスク1回で 70-80% 完成ドキュメント

**パック仕様**:

```typescript
{
  key: "facility_visit",
  inputSchema: {
    required: ["facility", "visit_date", "purpose"],
    optional: ["prior_visit_path", "contract_ids", "technical_issues"]
  },
  costProfile: { maxInputTokens: 20000, maxRounds: 4, defaultReasoning: "high" },
  qaRules: {
    requireSections: ["header","contacts","pre_visit_checklist",
                      "agenda","technical_context","contract_status","followup"],
    failOnMissingSections: true
  }
}
```

**3エージェント連携**:

1. Research Agent: 施設ZKノート + 契約ダッシュボード + 最新メール分類 → 構造化コンテキストJSON
2. Draft Agent: コンテキストJSON → 正規フォーマットの訪問準備文書（アジェンダP0-P4、チェックリスト、技術DeepDive）
3. QA Agent（チームリーダー）: 必須セクション確認 + 契約番号整合 + チェックリスト動詞確認

#### 統合 3: 契約進捗タスク

**価値**: 10契約の署名フローを `260319_Contract_Dashboard.md` と Claw Empire タスクビューで二重追跡 → 施設プロジェクト単位で可視化

---

### 朝のルーティン設計（steady state）

```
Phase 1 — データ生成（自動 ~5分）
  [mail terminal] python daily_pipeline.py
    → Outlook fetch → .msg変換 → 分類 → ハブ生成
    → [NEW] inbox_to_claw.py → ACTION項目を Claw Empire へ push

Phase 2 — トリアージ（Claw Empire UI ~10分）
  localhost:8800 → inbox フィルタ
  → 5-15件のACTION項目が施設別・優先度別に並ぶ
  → accept(→planned) or cancel(→cancelled)

Phase 3 — インテリジェンス（Claude Code mail terminal ~15分）
  → ハブ補完（週間文脈、フォローアップ待ち、対応推薦順）

Phase 4 — 実行（Claw Empire or Claude Code 適材適所）
  ・訪問準備 → Claw Empire facility_visit パック
  ・ZK操作 → Claude Code zk terminal（変更なし）
  ・メール返信確認 → ユーザー直接（自律実行なし）
```

---

### 統合してはいけないもの

| 対象                                         | 理由                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ZK監査を Claw Empire タスク化                | maxRounds:3 では150ノートの相互参照分析に不足。ZK Operations Skill + Claude Code zk terminal が正解  |
| daily_pipeline.py を Claw Empire 内で再実装  | 99.4%品質スコアを8 PDCAサイクルで構築したシステムを捨てる理由なし                                    |
| メール返信を自律生成                         | 契約ドキュメント・PI関係に契約上の重みがある。人間レビューゲートを削除してはならない                 |
| Obsidian Vault を Claw Empire プロジェクトに | `.obsidian/` 設定・プラグインとのコンフリクトリスク。ZK vaultはエージェントのread-onlyソースに留める |
| Cockpit Dashboard を Claw Empire で置き換え  | 週次GTD文書の情報モデルとタスクカードビューは別の目的を持つ。並列運用                                |

---

### 移行ロードマップ（段階的、ゼロ中断）

```
Week 1 — Infrastructure（30分）
  → 7施設プロジェクト作成（手動）
  → FACILITY_PROJECT_MAP 設定ファイル作成
  → inbox_to_claw.py 作成（まだ未接続）

Week 2 — 並列実行検証
  → daily_pipeline.py step 5 に接続
  → ハブファイル（従来）と Claw Empire inbox（新）を並行利用
  → 誤ルーティング・重複を特定

Week 3 — トリアージ移行
  → 朝のトリアージを Claw Empire inbox をprimaryに切り替え
  → ハブファイルは Phase 3（インテリジェンス）専用に

Week 4 — パック拡張
  → facility_visit パックを definitions.ts に追加
  → 次回訪問でテスト（手動版と比較）

Month 2 — 契約追跡
  → 現在の未完了契約アクションを Claw Empire タスクとしてインポート
  → Contract Dashboard は narrative view として維持
```

---

## Part 4: 統合優先度マトリクス

| 施策                                    | 価値                       | 工数            | 優先度          |
| --------------------------------------- | -------------------------- | --------------- | --------------- |
| PID永続化 + クラッシュリカバリ          | High (リスク排除)          | Low (50行)      | **🔴 即時**     |
| roleplay/novel パック無効化             | Medium                     | Trivial         | **🔴 即時**     |
| ワークフローパック DB駆動バリデーション | High (ユーザー定義解禁)    | Low (半日)      | **🟠 Week 1**   |
| 7施設プロジェクト作成                   | High (ルーティング前提)    | Low (UI操作)    | **🟠 Week 1**   |
| inbox_to_claw.py                        | High (毎朝の摩擦削減)      | Low (1ファイル) | **🟠 Week 1-2** |
| Pack Editor v1 (Settings UI)            | High (ユーザー定義パック)  | Medium (2-3日)  | **🟡 Week 2-3** |
| 構造化タスク作成フォーム                | High (初回合格率↑)         | Medium          | **🟡 Week 3-4** |
| facility_visit パック                   | High (訪問準備自動化)      | Medium          | **🟡 Week 4**   |
| RuntimeContext 完全型付き               | Medium (保守性)            | High (2日)      | **🟢 Month 2**  |
| Context snapshot injection              | High (文脈注入)            | Medium          | **🟢 Month 2**  |
| エージェント・スキル記憶                | Very High (ムーンショット) | High            | **🔵 Phase 3**  |

---

## ファイル参照

### Claw Empire

| ファイル                                                        | 役割                                |
| --------------------------------------------------------------- | ----------------------------------- |
| `server/modules/workflow/agents/cli-runtime.ts`                 | CLI spawning + PID管理              |
| `server/modules/workflow/orchestration/run-complete-handler.ts` | タスク完了 (型安全化優先)           |
| `server/modules/workflow/packs/definitions.ts`                  | パック定義 (DB駆動化対象)           |
| `server/modules/bootstrap/schema/base-schema.ts`                | スキーマ (active_cli_processes追加) |
| `server/modules/workflow/orchestration/xp-calculator.ts`        | XP (初回合格ボーナス追加)           |

### Inbox System

| ファイル                                             | 役割                                            |
| ---------------------------------------------------- | ----------------------------------------------- |
| `04_Output/03_Tools/daily_pipeline.py`               | step 5 追加対象                                 |
| `04_Output/03_Tools/inbox_to_claw.py`                | 新規作成                                        |
| `04_Output/03_Tools/claw_facility_map.json`          | 新規作成 (施設→ProjectID)                       |
| `01_Input/03_Email/_Index/email_classification.json` | ACTIONアイテムソース                            |
| `03_Workspace/260319_visit_prep_W13.md`              | facility_visit パックのリファレンスフォーマット |

---

_このBlueprintは 2026-03-21 に Architecture / Product / Integration の3体Sonnetエージェントによるdebate分析から合成された。実装開始前にユーザー承認が必要。_
