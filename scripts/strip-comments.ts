// @effect-diagnostics nodeBuiltinImport:off globalConsole:off -- Standalone maintenance script run with plain Node.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { parseSync } from "oxc-parser";

const SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const PLAIN_JS_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const EXCLUDED_PATH =
  /(^|\/)(node_modules|dist|dist-electron|\.repos|vendor|fixtures|__fixtures__|__snapshots__|patches|\.vite-plus)\/|\.gen\.[cm]?[jt]sx?$|(^|\/)generated[^/]*$/;

const DIRECTIVE =
  /^[\s*]*(eslint-|oxlint-|@ts-(expect-error|ignore|nocheck|check)\b|@effect-diagnostics|@vite-ignore|[@#]__(PURE|NO_SIDE_EFFECTS)__|@vitest-environment|@jsx|webpack[A-Z]|prettier-ignore|oxfmt-ignore|(istanbul|c8|v8) ignore|@license|@preserve)/;
const TOOL_TAG_LINE = /@effect-[\w-]+\b.*|@(public|internal|deprecated|alpha|beta)\b/;
const JSDOC_TYPE =
  /@(type|typedef|callback|template|satisfies|import)\b|@(param|returns?|property|prop)\s*\{/;

interface Comment {
  readonly type: "Line" | "Block";
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

function keepComment(comment: Comment, plainJs: boolean): boolean {
  if (comment.type === "Block" && comment.value.startsWith("!")) return true;
  if (comment.type === "Line" && /^\/\s*<(reference|amd-module)/.test(comment.value)) return true;
  if (DIRECTIVE.test(comment.value)) return true;
  return plainJs && comment.type === "Block" && JSDOC_TYPE.test(comment.value);
}

/**
 * Doc comments can carry tags that tools act on: Effect diagnostics
 * (`@effect-expect-leaking`), knip (`@public`, `@internal`) and TypeScript
 * (`@deprecated`). Such a comment shrinks to just those tags.
 */
function toolTagsOnly(comment: Comment): string | null {
  if (comment.type !== "Block") return null;
  const tags = comment.value
    .split("\n")
    .map((line) => TOOL_TAG_LINE.exec(line)?.[0].trim())
    .filter((tag): tag is string => tag !== undefined);
  if (tags.length === 0) return null;
  return tags.length === 1
    ? `/** ${tags[0]} */`
    : `/**\n${tags.map((tag) => ` * ${tag}`).join("\n")}\n */`;
}

/** Removes the given ranges, dropping lines that held nothing but a comment. */
type Range = readonly [start: number, end: number, replacement?: string];

function removeRanges(text: string, ranges: ReadonlyArray<Range>): string {
  let result = text;
  for (const [rangeStart, rangeEnd, replacement] of [...ranges].sort(
    (left, right) => right[0] - left[0],
  )) {
    if (replacement !== undefined) {
      result = result.slice(0, rangeStart) + replacement + result.slice(rangeEnd);
      continue;
    }
    let start = rangeStart;
    let end = rangeEnd;
    const lineStart = result.lastIndexOf("\n", start - 1) + 1;
    const nextNewline = result.indexOf("\n", end);
    const lineEnd = nextNewline === -1 ? result.length : nextNewline;
    const before = result.slice(lineStart, start);
    const after = result.slice(end, lineEnd);
    if (before.trim() === "" && after.trim() === "") {
      start = lineStart;
      end = nextNewline === -1 ? result.length : nextNewline + 1;
    } else if (after.trim() === "") {
      while (start > lineStart && /[ \t]/.test(result[start - 1] ?? "")) start -= 1;
    } else if (/[ \t]$/.test(before) && /^[ \t]/.test(after)) {
      end += 1;
    }
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}

/** Spans of JSX children that hold only a comment; those braces go with the comment. */
function emptyJsxContainers(node: unknown, spans: Array<readonly [number, number]>) {
  if (Array.isArray(node)) {
    for (const child of node) emptyJsxContainers(child, spans);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const expression = record.expression as { type?: unknown } | undefined;
  if (record.type === "JSXExpressionContainer" && expression?.type === "JSXEmptyExpression") {
    spans.push([record.start as number, record.end as number]);
  }
  for (const [key, value] of Object.entries(record)) {
    if (key !== "parent") emptyJsxContainers(value, spans);
  }
}

function stripScript(path: string, text: string): string {
  const plainJs = PLAIN_JS_EXTENSIONS.has(NodePath.extname(path));
  const parsed = parseSync(path, text);
  if (parsed.errors.length > 0) {
    throw new Error(`${path}: ${parsed.errors[0]?.message ?? "parse error"}`);
  }
  const containers: Array<readonly [number, number]> = [];
  if (path.endsWith("x")) emptyJsxContainers(parsed.program, containers);
  const ranges = new Map<number, Range>();
  for (const comment of parsed.comments as ReadonlyArray<Comment>) {
    if (keepComment(comment, plainJs)) continue;
    const tagsOnly = toolTagsOnly(comment);
    if (tagsOnly !== null) {
      ranges.set(comment.start, [comment.start, comment.end, tagsOnly]);
      continue;
    }
    const container = containers.find(([start, end]) => start < comment.start && comment.end < end);
    const range = container ?? ([comment.start, comment.end] as const);
    ranges.set(range[0], range);
  }
  return ranges.size === 0 ? text : removeRanges(text, [...ranges.values()]);
}

function stripCss(text: string): string {
  const ranges: Array<Range> = [];
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      const end = close === -1 ? text.length : close + 2;
      if (text[index + 2] !== "!") ranges.push([index, end]);
      index = end - 1;
    }
  }
  return ranges.length === 0 ? text : removeRanges(text, ranges);
}

function trackedFiles(root: string, paths: ReadonlyArray<string>): ReadonlyArray<string> {
  const output = NodeChildProcess.execFileSync("git", ["ls-files", "-z", "--", ...paths], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return output
    .split("\0")
    .filter(
      (file) =>
        file.length > 0 &&
        !EXCLUDED_PATH.test(file) &&
        (SCRIPT_EXTENSIONS.has(NodePath.extname(file)) || NodePath.extname(file) === ".css"),
    );
}

const args = process.argv.slice(2);
const write = args.includes("--write");
const paths = args.filter((arg) => !arg.startsWith("--"));
const root = NodeChildProcess.execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

let changedFiles = 0;
let removedLines = 0;
const failures: Array<string> = [];
for (const file of trackedFiles(root, paths.length > 0 ? paths : ["."])) {
  const absolute = NodePath.join(root, file);
  const text = NodeFS.readFileSync(absolute, "utf8");
  let stripped: string;
  try {
    stripped = file.endsWith(".css") ? stripCss(text) : stripScript(file, text);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    continue;
  }
  if (stripped === text) continue;
  changedFiles += 1;
  removedLines += text.split("\n").length - stripped.split("\n").length;
  if (write) NodeFS.writeFileSync(absolute, stripped);
}

console.log(
  `${write ? "Stripped" : "Would strip"} comments in ${changedFiles} files (${removedLines} lines removed).`,
);
if (failures.length > 0) {
  console.log(`Skipped ${failures.length} files that did not parse:\n${failures.join("\n")}`);
}
if (!write) console.log("Dry run. Pass --write to change files.");
