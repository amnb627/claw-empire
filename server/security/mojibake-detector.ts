/**
 * 文字化け検出用ログ監視ユーティリティ
 *
 * Mobile Inboxの文字化けを検出し、ログ出力・アラートを行います。
 * API/DB/フロントエンド各層でのエンコーディング問題を監視します。
 *
 * @see https://github.com/anthropics/claw-empire/issues/xxx
 */

/**
 * 文字化け検出ログレベル
 */
export enum MojibakeLogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  CRITICAL = "critical",
}

/**
 * 文字化け検出結果
 */
export interface MojibakeDetectionResult {
  /** 検出されたか */
  detected: boolean;
  /** 検出されたパターン */
  patterns: string[];
  /** 重大度レベル */
  severity: MojibakeLogLevel;
  /** 検出された文字の位置情報 */
  positions: number[];
  /** 置換推奨される文字 */
  suggestions?: Array<{ original: string; suggestion: string }>;
}

/**
 * 文字化けパターン定義
 */
interface MojibakePattern {
  /** パターン名 */
  name: string;
  /** 検出用正規表現 */
  regex: RegExp;
  /** 重大度 */
  severity: MojibakeLogLevel;
  /** 説明 */
  description: string;
  /** 修正推奨 */
  suggestion?: string;
}

/**
 * 文字化け検出用パターンセット
 */
const MOJIBAKE_PATTERNS: MojibakePattern[] = [
  // Shift-JISで化けた場合の特徴的なパターン
  {
    name: "shift-jis-double-accent",
    regex: /[¨]/g,
    severity: MojibakeLogLevel.WARN,
    description: "Shift-JISで誤デコードされた可能性があるダブルアクセント",
    suggestion: "UTF-8でエンコードされていることを確認",
  },
  {
    name: "shift-jis-cedilla",
    regex: /[¸]/g,
    severity: MojibakeLogLevel.WARN,
    description: "Shift-JISで誤デコードされた可能性があるセディラ",
  },
  {
    name: "shift-jis-euro-in-kana",
    regex: /[\u0080-\u00A0]/g,
    severity: MojibakeLogLevel.WARN,
    description: "Shift-JISで誤デコードされた可能性がある制御文字領域",
  },
  // replacement character
  {
    name: "replacement-character",
    regex: /\uFFFD/g,
    severity: MojibakeLogLevel.ERROR,
    description: "文字のデコードに失敗した Replacement Character",
    suggestion: "入力データのエンコーディングを確認",
  },
  // 異常な繰り返しパターン
  {
    name: "abnormal-repetition",
    regex: /(.{10,}?)\1{4,}/g,
    severity: MojibakeLogLevel.INFO,
    description: "異常な文字列の繰り返し（エンコーディング問題の可能性）",
  },
  // UTF-8の誤りパターン
  {
    name: "invalid-utf8-sequence",
    regex: /[\uFFFE\uFFFF]/g,
    severity: MojibakeLogLevel.ERROR,
    description: "無効なUTF-8シーケンス",
  },
  // 絵文字の不正な分解
  {
    name: "broken-emoji",
    regex: /\p{Extended_Pictographic}\p{M}/gu,
    severity: MojibakeLogLevel.WARN,
    description: "絵文字の修飾子が分離している可能性",
  },
  // 半角カナと全角カナの混在異常
  {
    name: "abnormal-kana-mix",
    regex: /[ｱ-ﾟ][ぁ-ん]/g,
    severity: MojibakeLogLevel.INFO,
    description: "半角カタカナの後にひらがなが続く異常なパターン",
  },
  // 機種依存文字の過度な使用
  {
    name: "excess-device-dependent",
    regex: /[①-⑩⑪-⑳㊱-㊿㊀-㊉☑-☒☛-☞]/g,
    severity: MojibakeLogLevel.INFO,
    description: "機種依存文字の使用",
    suggestion: "可能な代替表現への変更を推奨",
  },
  // BOM検出
  {
    name: "bom-detected",
    regex: /^\uFEFF/g,
    severity: MojibakeLogLevel.INFO,
    description: "BOM（Byte Order Mark）が検出されました",
  },
];

/**
 * 文字化け監視設定
 */
export interface MojibakeDetectorOptions {
  /** 検出ログをコンソールに出力するか */
  enableConsoleLog?: boolean;
  /** 重大度フィルタ（このレベル以上のみ検出） */
  minSeverity?: MojibakeLogLevel;
  /** 無視するパターン名 */
  ignorePatterns?: string[];
  /** カスタム検出パターン */
  customPatterns?: MojibakePattern[];
  /** 文字列長の最大値（超える場合はサンプリング検査） */
  maxSampleLength?: number;
}

/**
 * デフォルト設定
 */
const DEFAULT_OPTIONS: Required<MojibakeDetectorOptions> = {
  enableConsoleLog: true,
  minSeverity: MojibakeLogLevel.INFO,
  ignorePatterns: [],
  customPatterns: [],
  maxSampleLength: 10000,
};

/**
 * 重大度レベルの比較
 */
function compareSeverity(a: MojibakeLogLevel, b: MojibakeLogLevel): number {
  const levels = {
    [MojibakeLogLevel.DEBUG]: 0,
    [MojibakeLogLevel.INFO]: 1,
    [MojibakeLogLevel.WARN]: 2,
    [MojibakeLogLevel.ERROR]: 3,
    [MojibakeLogLevel.CRITICAL]: 4,
  };
  return levels[a] - levels[b];
}

/**
 * 文字化け検出クラス
 */
export class MojibakeDetector {
  private options: Required<MojibakeDetectorOptions>;
  private patterns: MojibakePattern[];
  private detectionHistory: Array<{
    timestamp: Date;
    result: MojibakeDetectionResult;
    source: string;
  }> = [];

  constructor(options: MojibakeDetectorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.patterns = [...MOJIBAKE_PATTERNS, ...(this.options.customPatterns || [])];
  }

  /**
   * 文字列から文字化けを検出
   */
  detect(text: string, source: string = "unknown"): MojibakeDetectionResult {
    const detectedPatterns: string[] = [];
    const positions: number[] = [];
    const suggestions: Array<{ original: string; suggestion: string }> = [];
    let maxSeverity = MojibakeLogLevel.DEBUG;

    // 長すぎる文字列はサンプリング
    const sampleText =
      text.length > this.options.maxSampleLength
        ? text.slice(0, this.options.maxSampleLength) + "..." + text.slice(-1000)
        : text;

    for (const pattern of this.patterns) {
      // 無視リストに含まれるパターンはスキップ
      if (this.options.ignorePatterns.includes(pattern.name)) {
        continue;
      }

      // 重大度フィルタ
      if (compareSeverity(pattern.severity, this.options.minSeverity) < 0) {
        continue;
      }

      // パターンマッチ検出
      const matches = sampleText.matchAll(pattern.regex);
      for (const match of matches) {
        if (match.index !== undefined) {
          detectedPatterns.push(pattern.name);
          positions.push(match.index);
          if (pattern.suggestion) {
            suggestions.push({
              original: match[0],
              suggestion: pattern.suggestion,
            });
          }
          // 最大重大度を更新
          if (compareSeverity(pattern.severity, maxSeverity) > 0) {
            maxSeverity = pattern.severity;
          }
        }
      }
    }

    const result: MojibakeDetectionResult = {
      detected: detectedPatterns.length > 0,
      patterns: [...new Set(detectedPatterns)], // 重複排除
      severity: maxSeverity,
      positions: [...new Set(positions)], // 重複排除
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };

    // 履歴に記録
    this.detectionHistory.push({
      timestamp: new Date(),
      result,
      source,
    });

    // ログ出力
    if (this.options.enableConsoleLog && result.detected) {
      this.log(result, source);
    }

    return result;
  }

  /**
   * 検出結果をログ出力
   */
  private log(result: MojibakeDetectionResult, source: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      source,
      detected: result.detected,
      patterns: result.patterns,
      severity: result.severity,
      positionsCount: result.positions.length,
    };

    const logLevel = this.getLogLevel(result.severity);
    console[logLevel]("[MojibakeDetector]", JSON.stringify(logEntry, null, 2));
  }

  /**
   * 重大度レベルに対応するconsoleメソッドを取得
   */
  private getLogLevel(severity: MojibakeLogLevel): "log" | "warn" | "error" {
    switch (severity) {
      case MojibakeLogLevel.ERROR:
      case MojibakeLogLevel.CRITICAL:
        return "error";
      case MojibakeLogLevel.WARN:
        return "warn";
      default:
        return "log";
    }
  }

  /**
   * 検出履歴を取得
   */
  getHistory(limit?: number): Array<{
    timestamp: Date;
    result: MojibakeDetectionResult;
    source: string;
  }> {
    if (limit) {
      return this.detectionHistory.slice(-limit);
    }
    return [...this.detectionHistory];
  }

  /**
   * 検出履歴をクリア
   */
  clearHistory(): void {
    this.detectionHistory = [];
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): {
    totalDetections: number;
    detectionsByPattern: Record<string, number>;
    detectionsBySeverity: Record<string, number>;
    detectionsBySource: Record<string, number>;
  } {
    const detectionsByPattern: Record<string, number> = {};
    const detectionsBySeverity: Record<string, number> = {};
    const detectionsBySource: Record<string, number> = {};

    for (const entry of this.detectionHistory) {
      if (entry.result.detected) {
        for (const pattern of entry.result.patterns) {
          detectionsByPattern[pattern] = (detectionsByPattern[pattern] || 0) + 1;
        }
        detectionsBySeverity[entry.result.severity] = (detectionsBySeverity[entry.result.severity] || 0) + 1;
        detectionsBySource[entry.source] = (detectionsBySource[entry.source] || 0) + 1;
      }
    }

    return {
      totalDetections: this.detectionHistory.filter((e) => e.result.detected).length,
      detectionsByPattern,
      detectionsBySeverity,
      detectionsBySource,
    };
  }
}

/**
 * シングルトンインスタンス
 */
let globalDetector: MojibakeDetector | null = null;

/**
 * グローバル文字化け検出器を取得
 */
export function getMojibakeDetector(options?: MojibakeDetectorOptions): MojibakeDetector {
  if (!globalDetector) {
    globalDetector = new MojibakeDetector(options);
  }
  return globalDetector;
}

/**
 * 文字列の文字化けを検出（ユーティリティ関数）
 */
export function detectMojibake(text: string, options?: MojibakeDetectorOptions): MojibakeDetectionResult {
  const detector = new MojibakeDetector(options);
  return detector.detect(text);
}

/**
 * オブジェクト内のすべての文字列値に対して文字化け検出を実行
 */
export function detectMojibakeInObject(
  obj: unknown,
  options?: MojibakeDetectorOptions,
): Array<{ path: string; result: MojibakeDetectionResult }> {
  const results: Array<{ path: string; result: MojibakeDetectionResult }> = [];
  const detector = new MojibakeDetector(options);

  function traverse(current: unknown, path: string): void {
    if (typeof current === "string") {
      const result = detector.detect(current, path);
      if (result.detected) {
        results.push({ path, result });
      }
    } else if (Array.isArray(current)) {
      current.forEach((item, index) => {
        traverse(item, `${path}[${index}]`);
      });
    } else if (current && typeof current === "object") {
      for (const [key, value] of Object.entries(current)) {
        traverse(value, path ? `${path}.${key}` : key);
      }
    }
  }

  traverse(obj, "");
  return results;
}

/**
 * APIリクエスト/レスポンスの文字化け検出用ラッパー
 */
export interface MojibakeSafeResponse<T> {
  success: boolean;
  data?: T;
  mojibakeDetected?: boolean;
  mojibakeReport?: MojibakeDetectionResult;
}

/**
 * データが文字化けしていないか検証した上で返す
 */
export function validateDataMojibake<T>(data: T, options?: MojibakeDetectorOptions): MojibakeSafeResponse<T> {
  const detections = detectMojibakeInObject(data, options);

  if (detections.length > 0) {
    // 最も深刻な検出結果を取得
    const mostSevere = detections.reduce((prev, curr) =>
      compareSeverity(curr.result.severity, prev.result.severity) > 0 ? curr : prev,
    );

    return {
      success: false,
      data,
      mojibakeDetected: true,
      mojibakeReport: mostSevere.result,
    };
  }

  return {
    success: true,
    data,
    mojibakeDetected: false,
  };
}

/**
 * WebSocketメッセージの文字化け検出
 */
export function validateWebSocketMessage(
  message: string | unknown,
  options?: MojibakeDetectorOptions,
): MojibakeSafeResponse<unknown> {
  const messageStr = typeof message === "string" ? message : JSON.stringify(message);
  const result = detectMojibake(messageStr, options);

  return {
    success: !result.detected,
    data: message,
    mojibakeDetected: result.detected,
    mojibakeReport: result.detected ? result : undefined,
  };
}

/**
 * ロガー統合用：ログメッセージの文字化けを監視
 */
export function createMojibakeAwareLogger(
  baseLogger: Pick<typeof console, "log" | "warn" | "error">,
  options?: MojibakeDetectorOptions,
) {
  const detector = new MojibakeDetector(options);

  return {
    log: (...args: unknown[]) => {
      const message = args.map(String).join(" ");
      detector.detect(message, "console.log");
      baseLogger.log(...args);
    },
    warn: (...args: unknown[]) => {
      const message = args.map(String).join(" ");
      detector.detect(message, "console.warn");
      baseLogger.warn(...args);
    },
    error: (...args: unknown[]) => {
      const message = args.map(String).join(" ");
      detector.detect(message, "console.error");
      baseLogger.error(...args);
    },
  };
}

/**
 * 定期ヘルスチェック用：システム全体の文字エンコーディング健全性を確認
 */
export interface EncodingHealthCheckResult {
  healthy: boolean;
  timestamp: string;
  checks: {
    name: string;
    passed: boolean;
    message: string;
  }[];
}

export async function performEncodingHealthCheck(): Promise<EncodingHealthCheckResult> {
  const checks: Array<{ name: string; passed: boolean; message: string }> = [];

  // 1. 基本日本語文字のエンコード/デコードチェック
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const testStrings = [
    "あいうえお",
    "漢字文字",
    "ＡＢＣ１２３",
    "😀🎉🇯🇵",
    "𠮷野家", // サロゲートペア
  ];

  for (const testString of testStrings) {
    const encoded = encoder.encode(testString);
    const decoded = decoder.decode(encoded);
    const passed = decoded === testString;
    checks.push({
      name: `encode-decode: ${testString}`,
      passed,
      message: passed ? "OK" : `Failed: ${decoded}`,
    });
  }

  // 2. 文字化け検出器の動作チェック
  try {
    const detector = new MojibakeDetector();
    const normalText = "正常な日本語テキスト";
    const result = detector.detect(normalText, "health-check");
    checks.push({
      name: "detector: normal-text",
      passed: !result.detected,
      message: !result.detected ? "OK" : `False positive: ${result.patterns.join(", ")}`,
    });
  } catch (error) {
    checks.push({
      name: "detector",
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // 3. JSONパースの日本語対応チェック
  try {
    const jsonData = JSON.stringify({ 日本語: "テスト", value: 123 });
    const parsed = JSON.parse(jsonData);
    const passed = parsed.日本語 === "テスト";
    checks.push({
      name: "json: japanese-keys",
      passed,
      message: passed ? "OK" : `Failed: ${parsed.日本語}`,
    });
  } catch (error) {
    checks.push({
      name: "json: japanese-keys",
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // 4. encodeURIComponent/decodeURIComponentの日本語対応チェック
  try {
    const urlEncoded = encodeURIComponent("日本語テスト");
    const urlDecoded = decodeURIComponent(urlEncoded);
    const passed = urlDecoded === "日本語テスト";
    checks.push({
      name: "url-encoding: japanese",
      passed,
      message: passed ? "OK" : `Failed: ${urlDecoded}`,
    });
  } catch (error) {
    checks.push({
      name: "url-encoding: japanese",
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const allPassed = checks.every((c) => c.passed);

  return {
    healthy: allPassed,
    timestamp: new Date().toISOString(),
    checks,
  };
}
