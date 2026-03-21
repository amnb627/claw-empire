# モバイル対応技術仕様書

**作成日**: 2026-03-08
**担当**: Development Team (Bolt)

---

## 1. 概要

本ドキュメントはDecisionInbox機能のモバイルデバイス対応に関する技術仕様を定義する。

---

## 2. レスポンシブ設計

### 2.1 既存対応状況

| コンポーネント     | レスポンシブ対応 | 確認済み実装                          |
| :----------------- | :--------------- | :------------------------------------ |
| DecisionInboxModal | ✅               | `max-w-3xl`, `mx-4`, `max-h-[70vh]`   |
| AppHeaderBar       | ✅               | モバイルメニュー, Office Packセレクタ |
| TaskBoard          | ✅               | グリッドレイアウト対応                |
| ChatPanel          | ✅               | フレキシブルレイアウト                |

### 2.2 ブレークポイント

Tailwind CSS デフォルトブレークポイント使用：

| プレフィックス | 最小幅 | 対象デバイス              |
| :------------- | :----- | :------------------------ |
| `sm:`          | 640px  | スマートフォン（大）      |
| `md:`          | 768px  | タブレット（小）          |
| `lg:`          | 1024px | タブレット（大）/ノートPC |
| `xl:`          | 1280px | デスクトップ              |

---

## 3. DecisionInboxModal モバイル対応

### 3.1 現在の実装

```tsx
// src/components/DecisionInboxModal.tsx
<div className="relative mx-4 w-full max-w-3xl rounded-2xl ...">
  <div className="max-h-[70vh] overflow-y-auto p-4">{/* コンテンツ */}</div>
</div>
```

### 3.2 モバイル最適化項目

| 項目                 | 現状              | 推奨対応                                  |
| :------------------- | :---------------- | :---------------------------------------- |
| タップ領域           | 標準              | 44px以上に拡大（WCAG 2.1準拠）            |
| スクロール           | `overflow-y-auto` | 追加: `-webkit-overflow-scrolling: touch` |
| キーボード回避       | 未実装            | `viewport-fit=cover` + safe-area対応      |
| タッチフィードバック | 標準              | Active状態強化                            |

### 3.3 追加推奨CSS

```css
/* モバイルタッチスクロール最適化 */
.decision-inbox-scroll {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* タップ領域拡大 */
.decision-inbox-option {
  min-height: 44px;
  padding: 12px 16px;
}

/* アクティブ状態フィードバック */
.decision-inbox-option:active {
  transform: scale(0.98);
  transition: transform 0.1s ease;
}
```

---

## 4. Mobile Office Pack Selector

### 4.1 現在の実装

**テストファイル**: `src/app/AppHeaderBar.mobile-office-pack.test.tsx`

```tsx
<select id="mobile-office-pack-selector">
  <option value="development">Development</option>
  <option value="report">Report</option>
</select>
```

### 4.2 動作仕様

| 操作         | 動作                               |
| :----------- | :--------------------------------- |
| セレクタ変更 | `onChange(value)` コールバック発火 |
| 変更後       | モバイルメニュー自動クローズ       |

---

## 5. PWA (Progressive Web App) 対応

### 5.1 現状

- Service Worker: 未実装
- Manifest: 未実装
- インストールプロンプト: 未実装

### 5.2 推奨対応（優先度: Low）

```json
// public/manifest.json
{
  "name": "Claw Empire DecisionInbox",
  "short_name": "DecisionInbox",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#6366f1",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 6. モバイル特有のUX考慮事項

### 6.1 プル・ツー・リフレッシュ

DecisionInboxアイテムの更新を直感的に行うため、プル・ツー・リフレッシュ実装を推奨。

```tsx
// 推奨実装構造
import { usePullToRefresh } from "./hooks/usePullToRefresh";

function DecisionInboxModal({ onRefresh, ...props }) {
  const { pullRef, isPulling } = usePullToRefresh(onRefresh);

  return (
    <div ref={pullRef}>
      {isPulling && <RefreshIndicator />}
      {/* 現在のコンテンツ */}
    </div>
  );
}
```

### 6.2 スワイプ操作

| 操作       | 機能                   | 優先度 |
| :--------- | :--------------------- | :----- |
| 左スワイプ | アイテム却下/スキップ  | Medium |
| 右スワイプ | チャットを開く         | Medium |
| 長押し     | 追加オプションメニュー | Low    |

### 6.3 モバイル通知

プッシュ通知対応は将来的な拡張項目。

| OS      | 実装方法                 | 優先度 |
| :------ | :----------------------- | :----- |
| iOS     | Safari Push Notification | Low    |
| Android | Firebase Cloud Messaging | Low    |

---

## 7. パフォーマンス最適化

### 7.1 モバイル特有の制約

| 項目       | 対策                           |
| :--------- | :----------------------------- |
| 帯域幅制限 | アバター画像スプライト使用済み |
| メモリ制限 | 仮想スクロール導入検討         |
| バッテリー | ポーリング間隔調整可能         |

### 7.2 仮想スクロール（推奨）

アイテム数が100件を超える場合、仮想スクロール導入を推奨。

```tsx
// 推奨ライブラリ
import { useVirtualizer } from "@tanstack/react-virtual";

function DecisionInboxList({ items }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // アイテム推定高さ
  });
  // ...
}
```

---

## 8. アクセシビリティ（モバイル）

### 8.1 WCAG 2.1 Level AA 対応

| 基準                   | 現状 | 対応            |
| :--------------------- | :--- | :-------------- |
| タッチターゲットサイズ | 標準 | 44x44px minimum |
| コントラスト比         | 適合 | -               |
| フォーカス可視性       | 適合 | -               |

### 8.2 スクリーンリーダー対応

- iOS VoiceOver: 対応
- Android TalkBack: 対応

```tsx
// 推奨ARIA属性
<button aria-label={`${item.agentName}の${getKindLabel(item.kind)}`} aria-describedby={`item-${item.id}-content`}>
  {/* ... */}
</button>
```

---

## 9. データ永続化

### 9.1 オフライン対応

| 機能         | 現状       | 推奨対応            |
| :----------- | :--------- | :------------------ |
| アイテム閲覧 | 要サーバー | IndexedDBキャッシュ |
| 決定返信     | 要サーバー | キューイング + 同期 |
| ドラフト保存 | 一時的     | localStorage永続化  |

### 9.2 推奨キャッシュ戦略

```typescript
// Service Workerキャッシュ戦略
const CACHE_STRATEGY = {
  "/api/decision-inbox": "network-first", // 常に最新
  "/api/agents": "stale-while-revalidate",
  "/static/*": "cache-first",
};
```

---

## 10. テスト計画

### 10.1 モバイルテスト項目

| テスト           | 方法                     | 優先度 |
| :--------------- | :----------------------- | :----- |
| レスポンシブ表示 | デバイスエミュレーション | High   |
| タッチ操作       | Manual testing           | High   |
| パフォーマンス   | Lighthouse Mobile        | Medium |
| アクセシビリティ | axe DevTools             | Medium |

### 10.2 対象デバイス

| デバイス        | 画面サイズ | 優先度 |
| :-------------- | :--------- | :----- |
| iPhone SE       | 375x667    | High   |
| iPhone 14 Pro   | 393x852    | High   |
| Android（一般） | 360x640    | Medium |
| iPad Mini       | 768x1024   | Low    |

---

**付録: モバイル対応チェックリスト**

- [x] レスポンシブレイアウト実装
- [x] モバイルメニュー実装
- [x] Office Packセレクタ実装
- [ ] タッチ領域拡大（44px minimum）
- [ ] プル・ツー・リフレッシュ実装
- [ ] スワイプ操作実装
- [ ] 仮想スクロール導入
- [ ] Service Worker実装
- [ ] PWA Manifest実装
- [ ] プッシュ通知対応
