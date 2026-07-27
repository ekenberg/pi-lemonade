// Pure formatting for the `/lemonade-status` overlay. No I/O, no pi
// imports — kept fully unit-testable without a running server or a TUI.

import type {
  LemonadeHealth,
  LemonadeStats,
  LemonadeSystemStats,
} from "./lemonade-api.ts";

export interface StatusSnapshot {
  baseUrl: string;
  health: LemonadeHealth | null;
  stats: LemonadeStats | null;
  system: LemonadeSystemStats | null;
}

export interface StatusTheme {
  fg(color: string, s: string): string;
  bold(s: string): string;
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

/**
 * Split into grapheme clusters, so a ZWJ emoji family or a flag counts as one
 * unit. Falls back to code points if Intl.Segmenter is unavailable.
 */
function graphemes(s: string): string[] {
  if (segmenter) {
    return Array.from(segmenter.segment(s), (seg) => seg.segment);
  }
  return Array.from(s);
}

/** Terminal columns occupied by a single code point. */
function codePointWidth(cp: number): number {
  if (cp === 0x200d) return 0; // zero-width joiner
  if (cp >= 0xfe00 && cp <= 0xfe0f) return 0; // variation selectors
  if (cp >= 0x0300 && cp <= 0x036f) return 0; // combining diacriticals
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0; // control
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1f1e6 && cp <= 0x1f1ff) || // regional indicators (flags)
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

/** Columns occupied by one grapheme cluster (widest code point in it). */
function clusterWidth(cluster: string): number {
  let max = 0;
  for (const ch of cluster) {
    const w = codePointWidth(ch.codePointAt(0) ?? 0);
    if (w > max) max = w;
  }
  return max;
}

/**
 * Visible terminal width of `s`, ignoring ANSI escapes and accounting for
 * wide (CJK/emoji) and zero-width characters. Exported for tests: a naive
 * `.length` metric silently let wide model names overflow the box, and a test
 * that reuses the same flawed metric cannot catch that.
 */
export function visibleWidth(s: string): number {
  let width = 0;
  for (const cluster of graphemes(stripAnsi(s))) {
    width += clusterWidth(cluster);
  }
  return width;
}

/** Pad or truncate `s` to exactly `width` visible columns. */
function fitWidth(s: string, width: number): string {
  const w = Math.max(0, width);
  const vis = visibleWidth(s);
  if (vis === w) return s;
  if (vis < w) return s + " ".repeat(w - vis);

  // Truncate by grapheme cluster so a surrogate pair or emoji sequence is
  // never split. Lines here are plain text plus whole-segment theme.fg()
  // wraps, so dropping escapes on the truncating path keeps the accounting
  // honest. A cut landing mid-wide-character leaves a column short, so pad.
  const plain = stripAnsi(s);
  let out = "";
  let used = 0;
  for (const cluster of graphemes(plain)) {
    const cw = clusterWidth(cluster);
    if (used + cw > w) break;
    out += cluster;
    used += cw;
  }
  return used < w ? out + " ".repeat(w - used) : out;
}

/**
 * Render a percent (0-100) as a bracketed unicode bar. `undefined` renders
 * an all-empty bar. Out-of-range values clamp to [0, 100].
 */
export function bar(percent: number | undefined, cells = 20): string {
  const n = cells;
  if (percent === undefined || Number.isNaN(percent)) {
    return "░".repeat(n);
  }
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * n);
  return "█".repeat(filled) + "░".repeat(n - filled);
}

function fmtNum(n: number | undefined, decimals: number, suffix = ""): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(decimals)}${suffix}`;
}

function fmtInt(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n)}`;
}

function fmtPercentLabel(n: number | undefined): string {
  // Right-aligned to 4 columns so the gauge labels form a clean column
  // ("  2%", " 11%", "100%").
  if (n === undefined || Number.isNaN(n)) return "   —";
  return `${Math.round(n)}%`.padStart(4, " ");
}

/**
 * Render the full `/lemonade-status` overlay box. Never throws on any
 * combination of null/missing fields. Every returned line has visible width
 * exactly `width` (padded or truncated).
 */
export function renderStatus(
  snapshot: StatusSnapshot,
  width: number,
  theme: StatusTheme,
): string[] {
  try {
    return renderStatusInner(snapshot, width, theme);
  } catch {
    // Absolute last-resort guard: never throw out of the render path.
    return [fitWidth("lemonade-status: render error", width)];
  }
}

function renderStatusInner(
  snapshot: StatusSnapshot,
  width: number,
  theme: StatusTheme,
): string[] {
  const w = Math.max(4, width);
  const innerW = w - 2;
  const lines: string[] = [];

  const row = (content: string) =>
    fitWidth(theme.fg("border", "│") + fitWidth(content, innerW) + theme.fg("border", "│"), w);

  const divider = (label: string) => {
    const text = ` ─── ${label} `;
    // -1 keeps a one-column gap before the right border.
    const dashes = "─".repeat(Math.max(0, innerW - visibleWidth(text) - 1));
    return row(theme.fg("dim", text + dashes));
  };

  // Single source of truth for the bottom border, so the unreachable box and
  // the normal box can never drift apart (the `╯` corner was lost once).
  const footer = () => {
    const footerText = " auto-refresh 1s · r refresh · esc close ";
    const footerLeft = "╰─";
    const dashes = Math.max(
      0,
      innerW + 2 - footerLeft.length - visibleWidth(footerText) - 1,
    );
    return fitWidth(
      theme.fg("border", footerLeft) +
        theme.fg("dim", footerText) +
        theme.fg("border", "─".repeat(dashes)) +
        theme.fg("border", "╯"),
      w,
    );
  };

  const health = snapshot.health;

  if (health === null) {
    lines.push(fitWidth(theme.fg("border", `╭${"─".repeat(innerW)}╮`), w));
    lines.push(row(""));
    lines.push(
      row(` ${theme.fg("error", `● lemonade unreachable at ${snapshot.baseUrl}`)}`),
    );
    lines.push(row(""));
    lines.push(footer());
    return lines;
  }

  const version = health.version ?? "—";
  const status = health.status ?? "—";
  const headerRight = ` v${version} ● ${status} `;
  const headerLeft = "╭─ Lemonade ";
  // -1 leaves room for the closing `╮`; without it fitWidth truncates the corner.
  const dashCount = Math.max(
    0,
    innerW + 2 - headerLeft.length - visibleWidth(headerRight) - 1,
  );
  lines.push(
    fitWidth(
      theme.fg("border", headerLeft) +
        theme.fg("border", "─".repeat(dashCount)) +
        theme.fg("border", headerRight) +
        theme.fg("border", "╮"),
      w,
    ),
  );
  lines.push(row(""));

  // Defence in depth: fetchHealth already drops non-object entries, but this
  // function is exported and must not throw for any input. A single null
  // entry here previously collapsed the whole box to an error line.
  const models = (health.all_models_loaded ?? []).filter(
    (m) => m !== null && typeof m === "object",
  );
  if (models.length === 0) {
    lines.push(row(` ${theme.fg("dim", "○ no model resident")}`));
    lines.push(
      row(`   ${theme.fg("dim", "lemond idle-evicts; next request auto-loads")}`),
    );
  } else {
    for (const m of models) {
      lines.push(row(` ${theme.fg("success", "●")} ${m.model_name ?? "—"}`));
      const ctx = m.max_context_window !== undefined ? `${m.max_context_window}` : "—";
      lines.push(
        row(
          `   ${m.device ?? "—"} · ${m.type ?? "—"} · ${m.status ?? "—"} · ctx ${ctx} · ${
            m.pinned ? "pinned" : "unpinned"
          }`,
        ),
      );
      lines.push(row(`   pid ${m.pid ?? "—"} · ${m.backend_url ?? "—"}`));
      lines.push(row(`   ${m.checkpoint ?? "—"}`));
    }
  }
  lines.push(row(""));

  lines.push(divider("Residency"));
  const maxModels = health.max_models ?? {};
  const pinnedModels = health.pinned_models ?? {};
  const kinds = ["llm", "embedding", "image", "reranking", "transcription", "tts"];
  const residencyParts = kinds.map((k) => {
    const loaded = models.filter((m) => m.type === k).length;
    const max = maxModels[k] ?? "—";
    return `${k} ${loaded}/${max}`;
  });
  lines.push(row(`   ${residencyParts.slice(0, 3).join(" · ")}`));
  lines.push(row(`   ${residencyParts.slice(3).join(" · ")}`));
  const pinnedTotal = Object.values(pinnedModels).reduce(
    (a, b) => a + (typeof b === "number" ? b : 0),
    0,
  );
  lines.push(row(`   pinned: ${pinnedTotal > 0 ? pinnedTotal : "none"}`));
  lines.push(row(""));

  lines.push(divider("Last call"));
  const stats = snapshot.stats;
  lines.push(row(`   TTFT      ${fmtNum(stats?.time_to_first_token, 2, " s")}`));
  lines.push(row(`   Speed     ${fmtNum(stats?.tokens_per_second, 1, " tok/s")}`));
  lines.push(
    row(`   Tokens    ${fmtInt(stats?.input_tokens)} in → ${fmtInt(stats?.output_tokens)} out`),
  );
  lines.push(row(""));

  lines.push(divider("Totals"));
  lines.push(row(`   Requests  ${fmtInt(stats?.request_count_total)}`));
  lines.push(
    row(
      `   Tokens    ${fmtInt(stats?.input_tokens_total)} in → ${fmtInt(stats?.output_tokens_total)} out`,
    ),
  );
  lines.push(row(""));

  lines.push(divider("System"));
  const system = snapshot.system;
  const barCells = Math.max(4, Math.min(20, innerW - 15));
  lines.push(
    row(`   CPU  [${bar(system?.cpu_percent, barCells)}]  ${fmtPercentLabel(system?.cpu_percent)}`),
  );
  lines.push(
    row(`   GPU  [${bar(system?.gpu_percent, barCells)}]  ${fmtPercentLabel(system?.gpu_percent)}`),
  );
  lines.push(
    row(`   NPU  [${bar(system?.npu_percent, barCells)}]  ${fmtPercentLabel(system?.npu_percent)}`),
  );
  lines.push(
    row(
      `   RAM   ${fmtNum(system?.memory_gb, 1, " GB")}      VRAM  ${fmtNum(system?.vram_gb, 1, " GB")}`,
    ),
  );
  lines.push(row(""));

  lines.push(footer());

  return lines.map((line) => fitWidth(line, w));
}
