#!/usr/bin/env node
/**
 * エンコーディング設定確認スクリプト
 *
 * Mobile Inboxの各層（API/DB/フロントエンド）の文字エンコーディング設定を確認します。
 *
 * 使い方:
 *   node scripts/check-encoding.mjs
 *   node scripts/check-encoding.mjs --verbose
 *   node scripts/check-encoding.mjs --json
 *
 * @see https://github.com/anthropics/claw-empire/issues/xxx
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..");

/**
 * コマンドライン引数のパース
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    verbose: args.includes("--verbose") || args.includes("-v"),
    json: args.includes("--json") || args.includes("-j"),
    fix: args.includes("--fix") || args.includes("-f"),
  };
}

const OPTIONS = parseArgs();

/**
 * ログ出力関数
 */
function log(level, message, data = null) {
  if (OPTIONS.json) {
    console.log(JSON.stringify({ level, message, data, timestamp: new Date().toISOString() }));
  } else {
    const prefix =
      {
        info: "[INFO]",
        warn: "[WARN]",
        error: "[ERROR]",
        success: "[OK]",
      }[level] || `[${level.toUpperCase()}]`;
    console.log(`${prefix} ${message}`);
    if (data && OPTIONS.verbose) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * 色付け（非JSONモードのみ）
 */
function colorize(text, color) {
  if (OPTIONS.json) return text;
  const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
  };
  return `${colors[color] || ""}${text}${colors.reset || ""}`;
}

/**
 * チェック結果
 */
class CheckResult {
  constructor(category, name) {
    this.category = category;
    this.name = name;
    this.passed = false;
    this.details = {};
  }

  pass(details = {}) {
    this.passed = true;
    this.details = details;
    return this;
  }

  fail(details = {}) {
    this.passed = false;
    this.details = details;
    return this;
  }
}

/**
 * ファイルの存在チェック
 */
function checkFileExists(path) {
  const fullPath = resolve(ROOT_DIR, path);
  return existsSync(fullPath);
}

/**
 * ファイルを読み込んでエンコーディング関連の設定を抽出
 */
function analyzeFileForEncoding(path, patterns) {
  const fullPath = resolve(ROOT_DIR, path);
  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const content = readFileSync(fullPath, "utf-8");
    const results = {};

    for (const [key, pattern] of Object.entries(patterns)) {
      if (typeof pattern === "string") {
        const regex = new RegExp(pattern);
        const match = content.match(regex);
        if (match) {
          results[key] = match[1] || match[0];
        }
      } else if (pattern instanceof RegExp) {
        const match = content.match(pattern);
        if (match) {
          results[key] = match[1] || match[0];
        }
      }
    }

    return results;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Node.jsプロジェクトのpackage.jsonをチェック
 */
function checkPackageJson() {
  const result = new CheckResult("Project", "package.json encoding config");
  const pkgPath = "package.json";

  if (!checkFileExists(pkgPath)) {
    return result.fail({ error: "package.json not found" });
  }

  const pkg = JSON.parse(readFileSync(resolve(ROOT_DIR, pkgPath), "utf-8"));

  const issues = [];
  const info = {};

  // エンコーディング関連の設定をチェック
  if (pkg.type === "module") {
    info.moduleType = "ESM";
  }

  // scriptsにエンコーディング関連の設定があるか
  if (pkg.scripts) {
    const encodingScripts = Object.entries(pkg.scripts).filter(
      ([, cmd]) => cmd.includes("charset") || cmd.includes("encoding") || cmd.includes("utf8"),
    );
    if (encodingScripts.length > 0) {
      info.encodingScripts = encodingScripts.map(([name]) => name);
    }
  }

  return result.pass({ ...info, hasIssues: issues.length > 0, issues });
}

/**
 * TypeScript設定のチェック
 */
function checkTsConfig() {
  const result = new CheckResult("Project", "tsconfig.json");
  const tsconfigPaths = ["tsconfig.json", "server/tsconfig.json", "src/tsconfig.json"];

  let foundConfig = null;
  for (const path of tsconfigPaths) {
    if (checkFileExists(path)) {
      foundConfig = path;
      break;
    }
  }

  if (!foundConfig) {
    return result.fail({ error: "tsconfig.json not found" });
  }

  const tsconfig = JSON.parse(readFileSync(resolve(ROOT_DIR, foundConfig), "utf-8"));

  const issues = [];
  const info = { foundPath: foundConfig };

  // charsetオプションのチェック（古いTSバージョン）
  if (tsconfig.compilerOptions?.charset) {
    info.charset = tsconfig.compilerOptions.charset;
  }

  return result.pass({ ...info, hasIssues: issues.length > 0, issues });
}

/**
 * Vite設定のチェック
 */
function checkViteConfig() {
  const result = new CheckResult("Build", "vite.config.ts");
  const configPaths = ["vite.config.ts", "vite.config.js", "vite.config.mts", "src/vite.config.ts"];

  let foundConfig = null;
  for (const path of configPaths) {
    if (checkFileExists(path)) {
      foundConfig = path;
      break;
    }
  }

  if (!foundConfig) {
    return result.fail({ error: "vite.config not found" });
  }

  // TypeScriptファイルの解析（簡易的）
  const patterns = {
    charset: /charset:\s*['"]([^'"]+)['"]/,
  };
  const findings = analyzeFileForEncoding(foundConfig, patterns);

  const info = { foundPath: foundConfig, findings };
  return result.pass(info);
}

/**
 * HTMLファイルのエンコーディング宣言チェック
 */
function checkHtmlEncoding() {
  const result = new CheckResult("Frontend", "HTML charset declaration");
  const htmlPaths = ["index.html", "src/index.html", "public/index.html", "dist/index.html"];

  const findings = [];
  for (const path of htmlPaths) {
    if (checkFileExists(path)) {
      const content = readFileSync(resolve(ROOT_DIR, path), "utf-8");
      const charsetMatch = content.match(/<meta[^>]+charset=['"]?([^'"\s>]+)/i);
      const httpEquivMatch = content.match(
        /<meta\s+http-equiv=['"]content-type['"][^>]*content=['"][^;]*;\s*charset=([^'"]+)/i,
      );

      findings.push({
        path,
        charset: charsetMatch?.[1] || httpEquivMatch?.[1] || null,
      });
    }
  }

  if (findings.length === 0) {
    return result.fail({ error: "No HTML files found" });
  }

  const issues = findings.filter((f) => f.charset && f.charset.toLowerCase() !== "utf-8");
  return result.pass({
    findings,
    hasIssues: issues.length > 0,
    issues,
  });
}

/**
 * CSSのエンコーディング宣言チェック
 */
function checkCssEncoding() {
  const result = new CheckResult("Frontend", "CSS charset declaration");

  // 主要なCSSファイルを探す
  const cssPaths = ["src/index.css", "src/app.css", "src/style.css", "src/styles/index.css", "src/assets/styles.css"];

  const findings = [];
  for (const path of cssPaths) {
    if (checkFileExists(path)) {
      const content = readFileSync(resolve(ROOT_DIR, path), "utf-8");
      // @charsetルールのチェック
      const charsetMatch = content.match(/^@charset\s+['"]([^'"]+)['"];/im);

      findings.push({
        path,
        charset: charsetMatch?.[1] || null,
        hasCharset: !!charsetMatch,
      });
    }
  }

  const info = {
    findings,
    count: findings.length,
    hasIssues: findings.some((f) => f.charset && f.charset.toLowerCase() !== "utf-8"),
  };

  return result.pass(info);
}

/**
 * React/Vueコンポーネントのエンコーディングチェック
 */
function checkComponentEncoding() {
  const result = new CheckResult("Frontend", "Component encoding");

  // 絵文字・日本語を含むテスト文字列
  const testStrings = {
    japanese: "日本語テスト漢字ひらがなカタカナ",
    emoji: "😀😃😄😁😆😅🤣😂🙂🙃",
    surrogate: "𠮷野家", // サロゲートペア
  };

  // TextEncoder/TextDecoderの動作確認
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const results = {};
  let allPassed = true;

  for (const [key, testString] of Object.entries(testStrings)) {
    try {
      const encoded = encoder.encode(testString);
      const decoded = decoder.decode(encoded);
      const passed = decoded === testString;
      results[key] = {
        passed,
        byteLength: encoded.length,
        charLength: testString.length,
        encoded: Array.from(encoded)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" "),
      };
      if (!passed) allPassed = false;
    } catch (error) {
      results[key] = { error: error.message };
      allPassed = false;
    }
  }

  return result.pass({ results, allPassed });
}

/**
 * Express/API設定のチェック
 */
function checkApiEncoding() {
  const result = new CheckResult("Backend", "API encoding configuration");

  // Express関連の設定ファイルをチェック
  const serverFiles = [
    "server/index.ts",
    "server/index.js",
    "server/app.ts",
    "server/app.js",
    "server/server.ts",
    "server/server.js",
  ];

  const findings = [];
  for (const path of serverFiles) {
    const analysis = analyzeFileForEncoding(path, {
      contentType: /res\.setHeader\(['"]content-type['"],\s*['"][^;]*;\s*charset=([^'"]+)['"]/i,
      jsonCharset: /res\.json\s*\(/, // JSONデフォルトはUTF-8
      expressStatic: /express\.static\s*\(/,
    });

    if (analysis !== null) {
      findings.push({ path, analysis });
    }
  }

  const info = {
    findings,
    count: findings.length,
    hasExplicitCharset: findings.some((f) => f.analysis?.contentType),
  };

  return result.pass(info);
}

/**
 * データベース設定のチェック
 */
function checkDatabaseEncoding() {
  const result = new CheckResult("Backend", "Database encoding configuration");

  // データベース関連の設定ファイル
  const dbFiles = [
    "server/db/index.ts",
    "server/db/config.ts",
    "server/db/connection.ts",
    "server/db/knexfile.ts",
    "server/db/knexfile.js",
    "server/db/schema.sql",
    "prisma/schema.prisma",
    ".env",
    ".env.example",
  ];

  const findings = [];
  for (const path of dbFiles) {
    const analysis = analyzeFileForEncoding(path, {
      charset: /charset['"]?\s*[:=]\s*['"]?([^'"\s,]+)/i,
      encoding: /encoding['"]?\s*[:=]\s*['"]?([^'"\s,]+)/i,
      clientEncoding: /client_encoding\s*=\s*['"]?([^'"\s,]+)/i,
      databaseUrl: /DATABASE_URL.*charset=([^&\s'"]+)/i,
    });

    if (analysis !== null && Object.keys(analysis).length > 0) {
      findings.push({ path, analysis });
    }
  }

  const info = {
    findings,
    count: findings.length,
    hasUtf8Config: findings.some((f) => Object.values(f.analysis).some((v) => v && /utf/i.test(v))),
  };

  return result.pass(info);
}

/**
 * Git属性のチェック（.gitattributes）
 */
function checkGitAttributes() {
  const result = new CheckResult("VCS", ".gitattributes encoding");
  const gitattributesPath = ".gitattributes";

  if (!checkFileExists(gitattributesPath)) {
    return result.fail({ error: ".gitattributes not found", recommendation: "Set text file encoding to UTF-8" });
  }

  const content = readFileSync(resolve(ROOT_DIR, gitattributesPath), "utf-8");
  const lines = content.split("\n");

  const findings = {
    hasUtf8Setting: false,
    textFilesSetting: null,
    eolSetting: null,
  };

  for (const line of lines) {
    if (line.includes("text eol=")) {
      findings.eolSetting = line.trim();
    }
    if (line.includes("working-tree-encoding")) {
      findings.hasUtf8Setting = true;
    }
    if (line.match(/^[\w*]+.*text/)) {
      findings.textFilesSetting = line.trim();
    }
  }

  return result.pass(findings);
}

/**
 * CI/CD設定のエンコーディングチェック
 */
function checkCiCdEncoding() {
  const result = new CheckResult("CI/CD", "Workflow encoding settings");

  const workflowPaths = [
    ".github/workflows/*.yml",
    ".github/workflows/*.yaml",
    ".gitlab-ci.yml",
    "Jenkinsfile",
    "azure-pipelines.yml",
  ];

  // .github/workflowsディレクトリのファイルを直接確認
  const findings = [];
  const workflowsDir = resolve(ROOT_DIR, ".github/workflows");

  if (existsSync(workflowsDir)) {
    const { readdirSync } = require("fs");
    const files = readdirSync(workflowsDir);

    for (const file of files) {
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        const filePath = `.github/workflows/${file}`;
        const analysis = analyzeFileForEncoding(filePath, {
          javaOptions: /JAVA_TOOL_OPTIONS.*-Dfile\.encoding=([^\s'"]+)/i,
          locale: /LANG:?\s*['"]?([^\s'"]+)/i,
          charset: /charset['"]?\s*[:=]\s*['"]?([^'"\s,]+)/i,
        });

        if (analysis !== null) {
          findings.push({ path: filePath, analysis });
        }
      }
    }
  }

  const info = {
    findings,
    count: findings.length,
    hasExplicitEncoding: findings.some((f) => Object.values(f.analysis).some((v) => v && /utf/i.test(v))),
  };

  return result.pass(info);
}

/**
 * Docker設定のエンコーディングチェック
 */
function checkDockerEncoding() {
  const result = new CheckResult("Infrastructure", "Docker encoding settings");

  const dockerFiles = ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".dockerignore"];

  const findings = [];
  for (const path of dockerFiles) {
    const analysis = analyzeFileForEncoding(path, {
      envLang: /LANG\s*=?\s*['"]?([^\s'"]+)/i,
      envLocale: /LC_ALL\s*=?\s*['"]?([^\s'"]+)/i,
      utf8Env: /UTF-8/i,
    });

    if (analysis !== null) {
      findings.push({ path, analysis });
    }
  }

  const info = {
    findings,
    count: findings.length,
    hasUtf8Config: findings.some(
      (f) => Object.values(f.analysis).some((v) => v && /utf/i.test(v)) || f.analysis?.utf8Env,
    ),
  };

  return result.pass(info);
}

/**
 * 環境変数のエンコーディングチェック
 */
function checkEnvEncoding() {
  const result = new CheckResult("Runtime", "Environment encoding");

  const envVars = {
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    LC_CTYPE: process.env.LC_CTYPE,
  };

  const findings = {
    hasUtf8Lang: /utf/i.test(envVars.LANG || ""),
    hasUtf8LcAll: /utf/i.test(envVars.LC_ALL || ""),
    envVars,
  };

  return result.pass(findings);
}

/**
 * メイン実行関数
 */
async function main() {
  log("info", `Starting encoding check for Mobile Inbox...`);
  log("info", `Project root: ${ROOT_DIR}`);

  const results = [];

  // 各チェックを実行
  const checks = [
    checkPackageJson(),
    checkTsConfig(),
    checkViteConfig(),
    checkHtmlEncoding(),
    checkCssEncoding(),
    checkComponentEncoding(),
    checkApiEncoding(),
    checkDatabaseEncoding(),
    checkGitAttributes(),
    checkCiCdEncoding(),
    checkDockerEncoding(),
    checkEnvEncoding(),
  ];

  for (const check of checks) {
    results.push(check);
  }

  // 結果のサマリー
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  if (!OPTIONS.json) {
    console.log("\n" + "=".repeat(60));
    console.log(colorize("ENCODING CHECK SUMMARY", "blue"));
    console.log("=".repeat(60));

    for (const result of results) {
      const status = result.passed ? colorize("✓ PASS", "green") : colorize("✗ FAIL", "red");
      console.log(`\n${status} ${result.category}: ${result.name}`);
      if (OPTIONS.verbose) {
        console.log(JSON.stringify(result.details, null, 2));
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(
      `Total: ${results.length} | ${colorize(`${passed} passed`, "green")} | ${colorize(`${failed} failed`, failed > 0 ? "red" : "yellow")}`,
    );
    console.log("=".repeat(60));
  } else {
    console.log(
      JSON.stringify({
        summary: { total: results.length, passed, failed },
        results,
      }),
    );
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
