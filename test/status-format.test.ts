import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bar,
  renderStatus,
  visibleWidth,
  type StatusSnapshot,
  type StatusTheme,
} from "../src/status-format.ts";
import type {
  LemonadeHealth,
  LemonadeStats,
  LemonadeSystemStats,
} from "../src/lemonade-api.ts";

const identityTheme: StatusTheme = {
  fg: (_color: string, s: string) => s,
  bold: (s: string) => s,
};

// NOTE: this file deliberately uses the production `visibleWidth` rather than
// a local `.length` helper. The previous local helper reimplemented the same
// naive metric as the code under test, so width assertions were structurally
// blind to wide-character overflow. Correctness of the metric itself is
// pinned by explicit expected values in the tests below.

const sampleHealth: LemonadeHealth = {
  status: "ok",
  version: "11.0.0",
  model_loaded: "Qwen3-0.6B-GGUF",
  all_models_loaded: [
    {
      model_name: "Qwen3-0.6B-GGUF",
      device: "gpu",
      type: "llm",
      status: "ready",
      backend_url: "http://127.0.0.1:8001/v1",
      checkpoint: "unsloth/Qwen3-0.6B-GGUF:Q4_0",
      max_context_window: 40960,
      pid: 2592273,
      pinned: false,
    },
  ],
  max_models: {
    llm: 1,
    embedding: 1,
    image: 1,
    reranking: 1,
    transcription: 1,
    tts: 1,
  },
  pinned_models: {
    llm: 0,
    embedding: 0,
    image: 0,
    reranking: 0,
    transcription: 0,
    tts: 0,
  },
};

const sampleStats: LemonadeStats = {
  time_to_first_token: 7.841167872,
  tokens_per_second: 16.45071085,
  input_tokens: 5440,
  output_tokens: 385,
  input_tokens_total: 219015,
  output_tokens_total: 12489,
  request_count_total: 56,
};

const sampleSystem: LemonadeSystemStats = {
  cpu_percent: 1.97,
  gpu_percent: 11.0,
  npu_percent: 0.0,
  memory_gb: 12.6,
  vram_gb: 3.11,
};

function fullSnapshot(): StatusSnapshot {
  return {
    baseUrl: "http://localhost:13305",
    health: sampleHealth,
    stats: sampleStats,
    system: sampleSystem,
  };
}

function assertExactWidth(lines: string[], width: number) {
  for (const line of lines) {
    assert.equal(visibleWidth(line), width, `line ${JSON.stringify(line)} should have width ${width}`);
  }
}

// --- bar() ---

test("bar: 0 percent has no filled cells", () => {
  const b = bar(0);
  assert.equal(b.includes("█"), false);
  assert.equal(b.length, 20);
});

test("bar: 100 percent is all filled cells", () => {
  const b = bar(100);
  assert.equal(b, "█".repeat(20));
});

test("bar: 50 percent is half filled", () => {
  const b = bar(50, 20);
  assert.equal(b, "█".repeat(10) + "░".repeat(10));
});

test("bar: undefined renders all-empty", () => {
  const b = bar(undefined);
  assert.equal(b, "░".repeat(20));
});

test("bar: out-of-range values clamp", () => {
  assert.equal(bar(150), "█".repeat(20));
  assert.equal(bar(-5), "░".repeat(20));
});

// --- renderStatus: full snapshot ---

test("renderStatus: full snapshot renders exact-width lines with expected content", () => {
  const width = 58;
  const lines = renderStatus(fullSnapshot(), width, identityTheme);
  assertExactWidth(lines, width);

  const all = lines.join("\n");
  assert.match(all, /Qwen3-0\.6B-GGUF/);
  assert.match(all, /gpu/);
  assert.match(all, /ready/);
  assert.match(all, /40960/);
  assert.match(all, /7\.84 s/);
  assert.match(all, /16\.5 tok\/s/);
  assert.match(all, /56/); // request_count_total
  assert.match(all, /219015/);
  assert.match(all, /12489/);
  // three gauge rows (CPU/GPU/NPU) each contain a bar
  assert.match(all, /CPU\s+\[[█░]+\]/);
  assert.match(all, /GPU\s+\[[█░]+\]/);
  assert.match(all, /NPU\s+\[[█░]+\]/);
});

// --- renderStatus: nothing resident ---

test("renderStatus: empty all_models_loaded shows no-model-resident state and other sections", () => {
  const width = 58;
  const snapshot: StatusSnapshot = {
    baseUrl: "http://localhost:13305",
    health: { ...sampleHealth, model_loaded: null, all_models_loaded: [] },
    stats: sampleStats,
    system: sampleSystem,
  };
  const lines = renderStatus(snapshot, width, identityTheme);
  assertExactWidth(lines, width);
  const all = lines.join("\n");
  assert.match(all, /no model resident/);
  assert.match(all, /Residency/);
  assert.match(all, /Last call/);
  assert.match(all, /Totals/);
  assert.match(all, /System/);
});

// --- renderStatus: unreachable ---

test("renderStatus: null health renders unreachable box with baseUrl, no throw", () => {
  const width = 58;
  const snapshot: StatusSnapshot = {
    baseUrl: "http://localhost:13305",
    health: null,
    stats: null,
    system: null,
  };
  assert.doesNotThrow(() => renderStatus(snapshot, width, identityTheme));
  const lines = renderStatus(snapshot, width, identityTheme);
  assertExactWidth(lines, width);
  const all = lines.join("\n");
  assert.match(all, /unreachable/);
  assert.match(all, /http:\/\/localhost:13305/);
});

// --- renderStatus: partial failure ---

test("renderStatus: null stats with health+system present renders placeholders, no throw", () => {
  const width = 58;
  const snapshot: StatusSnapshot = {
    baseUrl: "http://localhost:13305",
    health: sampleHealth,
    stats: null,
    system: sampleSystem,
  };
  assert.doesNotThrow(() => renderStatus(snapshot, width, identityTheme));
  const lines = renderStatus(snapshot, width, identityTheme);
  assertExactWidth(lines, width);
  const all = lines.join("\n");
  assert.match(all, /—/);
  // Sections still render even without stats.
  assert.match(all, /Last call/);
  assert.match(all, /Totals/);
});

// --- renderStatus: multiple resident models ---

test("renderStatus: multiple resident models shows both names", () => {
  const width = 58;
  const snapshot: StatusSnapshot = {
    baseUrl: "http://localhost:13305",
    health: {
      ...sampleHealth,
      all_models_loaded: [
        sampleHealth.all_models_loaded[0]!,
        {
          model_name: "embed-gemma-300m-FLM",
          device: "cpu",
          type: "embedding",
          status: "ready",
          backend_url: "http://127.0.0.1:8002/v1",
          checkpoint: "embed-gemma-300m",
          max_context_window: 8192,
          pid: 111,
          pinned: true,
        },
      ],
    },
    stats: sampleStats,
    system: sampleSystem,
  };
  const lines = renderStatus(snapshot, width, identityTheme);
  assertExactWidth(lines, width);
  const all = lines.join("\n");
  assert.match(all, /Qwen3-0\.6B-GGUF/);
  assert.match(all, /embed-gemma-300m-FLM/);
});

// --- renderStatus: narrow width ---

test("renderStatus: narrow width still produces exact-width lines without crashing", () => {
  const width = 30;
  assert.doesNotThrow(() => renderStatus(fullSnapshot(), width, identityTheme));
  const lines = renderStatus(fullSnapshot(), width, identityTheme);
  assertExactWidth(lines, width);
});

test("renderStatus: narrow width unreachable state also exact-width", () => {
  const width = 30;
  const snapshot: StatusSnapshot = {
    baseUrl: "http://localhost:13305",
    health: null,
    stats: null,
    system: null,
  };
  const lines = renderStatus(snapshot, width, identityTheme);
  assertExactWidth(lines, width);
});

// --- Regression tests: box corners were lost in the unreachable branch and
// --- the header (fitWidth truncated the corner because of an off-by-one).

test("renderStatus: box corners are intact in every state", () => {
  const cases: Array<[string, StatusSnapshot]> = [
    [
      "resident",
      { baseUrl: "http://localhost:13305", health: sampleHealth, stats: sampleStats, system: sampleSystem },
    ],
    [
      "empty",
      {
        baseUrl: "http://localhost:13305",
        health: { ...sampleHealth, all_models_loaded: [], model_loaded: null },
        stats: sampleStats,
        system: sampleSystem,
      },
    ],
    [
      "unreachable",
      { baseUrl: "http://localhost:13305", health: null, stats: null, system: null },
    ],
    [
      "partial",
      { baseUrl: "http://localhost:13305", health: sampleHealth, stats: null, system: sampleSystem },
    ],
  ];

  for (const [name, snapshot] of cases) {
    const lines = renderStatus(snapshot, 58, identityTheme);
    const first = lines[0] ?? "";
    const last = lines[lines.length - 1] ?? "";
    assert.ok(first.startsWith("╭"), `${name}: top-left corner missing`);
    assert.ok(first.endsWith("╮"), `${name}: top-right corner missing`);
    assert.ok(last.startsWith("╰"), `${name}: bottom-left corner missing`);
    assert.ok(last.endsWith("╯"), `${name}: bottom-right corner missing`);
  }
});

test("renderStatus: gauge percentage labels are right-aligned to a column", () => {
  const snapshot: StatusSnapshot = {
    baseUrl: "http://localhost:13305",
    health: sampleHealth,
    stats: sampleStats,
    system: { cpu_percent: 2, gpu_percent: 11, npu_percent: 100, memory_gb: 12.6, vram_gb: 3.1 },
  };
  const lines = renderStatus(snapshot, 58, identityTheme);
  const gauges = lines.filter((l) => /\[[█░]+\]/.test(l));
  assert.equal(gauges.length, 3);
  // The character column at which each percentage label ends must be identical.
  const ends = gauges.map((l) => l.indexOf("%"));
  assert.equal(new Set(ends).size, 1, `labels not column-aligned: ${JSON.stringify(gauges)}`);
});

// --- Reviewer findings (v1.1 independent review): a null entry in
// --- all_models_loaded collapsed the whole box, and the width metric was not
// --- wide-character aware so CJK/emoji model names overflowed the border.

test("visibleWidth: counts terminal columns, not UTF-16 units", () => {
  // Hand-computed expected values; do NOT derive these from the implementation.
  assert.equal(visibleWidth("Model"), 5);
  assert.equal(visibleWidth("模型"), 4); // 2 wide chars
  assert.equal(visibleWidth("🎉"), 2);
  assert.equal(visibleWidth("模型🎉测试Model"), 15); // 4 + 2 + 4 + 5
  assert.equal(visibleWidth("👨‍👩‍👧‍👦"), 2); // one ZWJ cluster, 11 UTF-16 units
  assert.equal(visibleWidth("🇯🇵"), 2); // flag = regional-indicator pair
  assert.equal(visibleWidth("e\u0301"), 1); // combining acute is zero-width
  assert.equal(visibleWidth("\x1b[31mred\x1b[0m"), 3); // ANSI ignored
});

test("renderStatus: wide-character model names do not overflow the box", () => {
  const snapshot: StatusSnapshot = {
    baseUrl: "http://localhost:13305",
    health: {
      ...sampleHealth,
      all_models_loaded: [
        {
          model_name: "模型🎉测试Model-👨‍👩‍👧‍👦",
          device: "gpu",
          type: "llm",
          status: "ready",
          checkpoint: "组织/模型名称-Q4_K_M",
          backend_url: "http://127.0.0.1:8001/v1",
          max_context_window: 40960,
          pid: 1234,
          pinned: false,
        },
      ],
    },
    stats: sampleStats,
    system: sampleSystem,
  };

  for (const width of [20, 30, 58, 200]) {
    const lines = renderStatus(snapshot, width, identityTheme);
    for (const line of lines) {
      assert.equal(
        visibleWidth(line),
        width,
        `width ${width}: line has ${visibleWidth(line)} columns: ${JSON.stringify(line)}`,
      );
    }
  }
});

test("renderStatus: a null entry in all_models_loaded does not collapse the box", () => {
  const snapshot: StatusSnapshot = {
    baseUrl: "http://localhost:13305",
    health: {
      ...sampleHealth,
      all_models_loaded: [
        null as unknown as (typeof sampleHealth)["all_models_loaded"][number],
        { model_name: "Qwen3-0.6B-GGUF", type: "llm", device: "gpu", status: "ready" },
      ],
    },
    stats: sampleStats,
    system: sampleSystem,
  };

  assert.doesNotThrow(() => renderStatus(snapshot, 58, identityTheme));
  const lines = renderStatus(snapshot, 58, identityTheme);
  const joined = lines.join("\n");
  assert.ok(lines.length > 5, `box collapsed to ${lines.length} line(s): ${joined}`);
  assert.match(joined, /Qwen3-0\.6B-GGUF/);
  assert.match(joined, /System/); // later sections still rendered
  assert.ok(lines[lines.length - 1]?.endsWith("╯"), "box not properly closed");
});
