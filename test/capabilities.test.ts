import { test } from "node:test";
import assert from "node:assert/strict";
import { isChatModel, toPiModel } from "../src/capabilities.ts";
import type { LemonadeModel } from "../src/lemonade-api.ts";

function model(overrides: Partial<LemonadeModel>): LemonadeModel {
  return {
    id: "test-model",
    labels: [],
    downloaded: true,
    recipe: "llamacpp",
    ...overrides,
  };
}

test("toPiModel: vision model maps image input, large context, thinking format", () => {
  const m = model({
    id: "vision-model",
    labels: ["vision", "tool-calling"],
    max_context_window: 262144,
  });
  assert.equal(isChatModel(m), true);
  const mapped = toPiModel(m);
  assert.deepEqual(mapped.input, ["text", "image"]);
  assert.equal(mapped.contextWindow, 262144);
  assert.equal(mapped.maxTokens, 32768);
  assert.equal(mapped.reasoning, true);
  assert.equal(mapped.compat.thinkingFormat, "qwen-chat-template");
});

test("toPiModel: non-vision small model has text-only input and small maxTokens", () => {
  const m = model({
    id: "small-model",
    labels: ["tool-calling"],
    max_context_window: 40960,
  });
  const mapped = toPiModel(m);
  assert.deepEqual(mapped.input, ["text"]);
  assert.equal(mapped.maxTokens, 4096);
});

test("toPiModel: missing max_context_window defaults to 32768 ctx / 4096 maxTokens", () => {
  const m = model({ id: "no-ctx-model" });
  const mapped = toPiModel(m);
  assert.equal(mapped.contextWindow, 32768);
  assert.equal(mapped.maxTokens, 4096);
});

test("isChatModel: embeddings label (recipe flm) is filtered out", () => {
  const m = model({ recipe: "flm", labels: ["embeddings"] });
  assert.equal(isChatModel(m), false);
});

test("isChatModel: audio/transcription labels are filtered out", () => {
  const m = model({
    labels: ["audio", "realtime-transcription", "transcription"],
  });
  assert.equal(isChatModel(m), false);
});

test("isChatModel: thinksound recipe is filtered out", () => {
  const m = model({ recipe: "thinksound" });
  assert.equal(isChatModel(m), false);
});

test("isChatModel: not downloaded is filtered out", () => {
  const m = model({ downloaded: false });
  assert.equal(isChatModel(m), false);
});

test("isChatModel: empty labels, recipe flm, downloaded true is kept (plain chat model)", () => {
  const m = model({ recipe: "flm", labels: [], downloaded: true });
  assert.equal(isChatModel(m), true);
});

test("toPiModel: labels missing 'reasoning' still map reasoning:true (blanket rule)", () => {
  const m = model({ labels: ["tool-calling"] });
  const mapped = toPiModel(m);
  assert.equal(mapped.reasoning, true);
});
