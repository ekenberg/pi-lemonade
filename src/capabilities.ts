import type { LemonadeModel } from "./lemonade-api.ts";

export interface PiModelConfig {
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  compat: {
    supportsStore: boolean;
    supportsDeveloperRole: boolean;
    maxTokensField: string;
    thinkingFormat: string;
  };
}

const EXCLUDED_LABELS = new Set([
  "embeddings",
  "transcription",
  "realtime-transcription",
  "audio-generation",
  "reranking",
]);

const CHAT_RECIPES = new Set(["llamacpp", "flm"]);

/** Keep a model iff it is a downloaded, chat-capable LLM (not embeddings/audio/etc). */
export function isChatModel(m: LemonadeModel): boolean {
  if (m.downloaded !== true) return false;
  if (!CHAT_RECIPES.has(m.recipe)) return false;
  if (m.labels.some((label) => EXCLUDED_LABELS.has(label))) return false;
  return true;
}

/** Map a Lemonade model entry to a pi model config, per the fixed mapping table. */
export function toPiModel(m: LemonadeModel): PiModelConfig {
  const contextWindow = m.max_context_window ?? 32768;
  const maxTokens = contextWindow >= 65536 ? 32768 : 4096;
  const input = m.labels.includes("vision") ? ["text", "image"] : ["text"];

  return {
    id: m.id,
    name: m.id,
    reasoning: true,
    input,
    contextWindow,
    maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      maxTokensField: "max_tokens",
      thinkingFormat: "qwen-chat-template",
    },
  };
}
