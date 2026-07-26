# DISCOVERY.md — pi-lemonade evaluation output

This file is the **output target** for the context-gathering / discovery
phase described in AGENTS.md. Fill it in as you verify and assess; do not
edit HANDOVER.md (it is the input/freeze of what was known at handover —
record corrections here in §Discrepancies, and update HANDOVER.md only if
the owner directs a re-freeze).

Date: 2026-07-26 (discovery run; second-pass verification + owner decision same day)

## Verified facts

Confirm (or correct) the claims in HANDOVER.md §8. One line each, dated.
Preface any that fail with `❌` and move the detail to §Discrepancies.

- ✅ `GET :13305/v1/models` → JSON, **20** model ids (HANDOVER §8 says 4 — see §Discrepancies)
- ✅ `GET :13305/api/v1/models` → richer objects with `labels[]`, `max_context_window`, `checkpoints`, `recipe_options`, `type`, `downloaded`
- ✅ `GET :13305/api/v1/health` → `{status:"ok", all_models_loaded:[], max_models:{llm:1,…}, version:"11.0.0"}`
- ✅ `GET :13305/health` and `/props?autoload=false` → HTML + 200 (SPA trap, confirmed `text/html`)
- ✅ `POST :13305/v1/chat/completions` round-trips on Qwen3.6-35B (response includes `reasoning_content`)
- ✅ `~/.pi/agent/models.json` has `Lemonade` provider, **4** hand-maintained models
- ✅ `~/.pi/agent/settings.json` has no `pi-llama-cpp` in `packages`; has `Lemonade/qwen3vl-it-4b-FLM` in `enabledModels` (only 1 of 4 — see §Discrepancies)
- ✅ `~/.pi/agent/npm/node_modules/pi-llama-cpp/` — **pruned** (not present; see §Discrepancies)

Additional verified facts:

- **SPA trap confirmed precisely**: `/health`, `/props?autoload=false`, and `/nonexistent-anything` all return `text/html` with HTTP 200. `/api/v1/nonexistent` returns `application/json` 404. Rule holds: only trust `/api/` paths; treat `text/html` as absent.
- **`/api/v1/load`** uses key `model_name` (not `model`). `POST /api/v1/load {"model_name":"Qwen3.6-35B-A3B-MTP-Uncensored"}` → `{"status":"success",…}`. Using `{"model":"…"}` → HTTP 400 `{"error":{…,"type":"invalid_request"}}`. Source confirms: `server.cpp:5142 model_name = request_json["model_name"]`.
- **`/api/v1/unload`** uses key `model_name`. `POST /api/v1/unload {"model_name":"Qwen3.6-35B-A3B-MTP-Uncensored"}` → `{"status":"success","message":"Model unloaded successfully"}`.
- **`/api/v1/stats`** returns `time_to_first_token`, `tokens_per_second`, `input_tokens`, `output_tokens`, `prompt_tokens`, `request_count_total`, and `_total` cumulative fields. Values update after each chat call (request_count went 24→25, last-call fields changed to match the 17-prompt/16-output call).
- **`/api/v1/system-stats`** returns `cpu_percent`, `gpu_percent`, `npu_percent`, `memory_gb`, `vram_gb`.
- **`/metrics`** (bare path) returns Prometheus exposition: `lemonade_server_up`, `lemonade_server_info{version="11.0.0"}`, `lemonade_loaded_models`, `lemonade_model_info`, `lemonade_model_loaded`, `lemonade_model_time_to_first_token_seconds`, `lemonade_model_tokens_per_second`, `lemonade_model_requests_total`, etc. `/api/v1/metrics` → 404 (confirmed bare-path rule).
- **Path aliases**: `/api/v1/*`, `/api/v0/*`, `/v1/*`, `/v0/*` all resolve to the same handlers (confirmed in `server.cpp:214-218,816,1798,1807`).
- **Quiet polling paths**: `stats`, `system-stats`, `downloads` are classified as "quiet polling" (request logging suppressed) — designed to be polled on a timer.
- **Version drift**: lemond source `CMakeLists.txt` says `VERSION 11.5.0`; running server reports `11.0.0` in `/api/v1/health`. The deployed binary is older than the current source.
- **Model labels observed**: `custom`, `vision`, `tool-calling`, `mtp`, `reasoning`, `audio`, `audio-generation`, `realtime-transcription`, `transcription`, `embeddings`. Not all models have `max_context_window` (e.g., `ThinkSound-SFX`, `embed-gemma-300m-FLM`, `whisper-v3-turbo-FLM` omit it).
- **Recipes**: `llamacpp` (GGUF models on GPU/iGPU), `flm` (NPU models), `thinksound` (audio generation). The `qwen3vl-it-4b-FLM` model is recipe `flm` with labels `["vision","tool-calling"]` — an NPU model, no `reasoning` label.
- **`--reasoning-preserve`** is present in `llamacpp_args` for all 3 MoE GGUF models (Qwen3.6-35B, Gemma4-26B, ThinkingCap-27B), meaning thinking is always ON server-side regardless of client parameters.

### Second-pass verification (2026-07-26, main session)

Independent re-check of this file's key claims:

- ✅ 20 model ids on `/v1/models` — confirmed.
- ✅ `pi-llama-cpp` pruned from `~/.pi/agent/npm/node_modules/` — confirmed.
- ✅ pi-ai `openai-completions.js` parses `reasoning_content` (line 353) and
  supports `thinkingFormat: "qwen-chat-template"` →
  `chat_template_kwargs.enable_thinking` (line 574) — confirmed in dist source
  (`@earendil-works/pi-ai`, not `@mariozechner/pi-ai`).
- ✅ **Live thinking-toggle test** on `Qwen3-0.6B-GGUF` (small, fast load):
  default request → `reasoning_content` populated, `content` empty until
  answer; with `chat_template_kwargs:{enable_thinking:false}` →
  `reasoning_content` empty, direct answer. **The mechanism works.** The
  extension's `qwen-chat-template` compat fix is verified real, not
  theoretical.
- ⚠️ Caveat: the toggle was tested on a model *without* `--reasoning-preserve`
  in its `llamacpp_args`. Whether it also works on the 3 big MoEs (which
  carry that flag) is untested — needs one cold-load test. Note:
  `--reasoning-preserve` is most plausibly about preserving reasoning content
  across turns in context, **not** forcing thinking on; the earlier claim
  "thinking is always ON server-side regardless of client parameters" is
  likely wrong and should not be relied on.
- ⚠️ **Label mapping gotcha**: the 3 big MoE GGUFs are labeled
  `mtp`+`vision`+`tool-calling` but **not** `reasoning`. Mapping
  `mtp`→reasoning happens to hit the right models today but is semantically
  bogus (MTP = multi-token prediction / speculative decoding, orthogonal to
  reasoning). The capability inference needs either a small override map, a
  probe, or explicit acceptance of this heuristic.

### pi openai-completions `reasoning_content` handling (gate test #1)

- ✅ pi **parses** `reasoning_content` from responses: `openai-completions.js:349-353` checks fields `["reasoning_content", "reasoning", "reasoning_text"]` and uses the first non-empty one.
- ✅ pi **sends** `reasoning_effort` as a top-level OpenAI parameter for custom providers: `detectCompat()` defaults `supportsReasoningEffort: true` and `thinkingFormat: "openai"` for non-matching providers (like `Lemonade`). Lines 632-636 send `params.reasoning_effort = …`.
- ❌ **BUT** lemond/llama.cpp does **not** understand `reasoning_effort`. It uses `enable_thinking` / `chat_template_kwargs.enable_thinking` / `preserve_thinking` (the `qwen-chat-template` format). The `--reasoning-preserve` flag in the model's `llamacpp_args` keeps thinking always ON.
- ❌ The static provider does **not** set `compat.thinkingFormat: "qwen-chat-template"` on any model. So the thinking knob in pi sends a parameter lemond ignores, and thinking level cannot be controlled from pi. The knob is **partially functional**: reasoning output is displayed (parsed from response), but the level slider is a no-op.
- An extension that sets `compat.thinkingFormat: "qwen-chat-template"` + a `thinkingLevelMap` would make the knob functional.

### pi-tps-meter measurement approach

- **Client-side**: measures from pi's `message_start` → `message_end` events using `Date.now()` and `event.message?.usage?.output`. Excludes TTFT from the rate calculation (`firstTokenMs` is the reference, not `streamStartMs`).
- lemond's `/api/v1/stats` provides **server-side** `time_to_first_token` and `tokens_per_second` (includes server-side queueing, true TTFT). These are strictly better for latency visibility but are not currently surfaced in pi's UI.

## Discrepancies / gaps in HANDOVER.md

Where HANDOVER.md was wrong, incomplete, or has drifted since handover. Cite
the section and give the corrected fact with evidence.

1. **§0 / §1: "stable at 3–4" is wrong.** The live lemond serves **20 models**, not 4. The original 4 GGUF models (Qwen3.6-35B, Gemma4-26B, ThinkingCap-27B, qwen3vl-it-4b-FLM) are still present, but 16 additional models have been added: FLM/NPU models (qwen3.5-2b/4b/9b-FLM, qwen3.6-moe-35b-a3b-FLM, qwen3-it-4b-FLM, lfm2.5-it-1.2b/2.6b-FLM, lfm2.5-tk-1.2b-FLM, gemma4-it-e4b-FLM, translategemma-4b-FLM, whisper-v3-turbo-FLM), a vision model (MiniCPM-V-4.6, ATH-MaaS_OvisOCR2), a small reasoning model (Qwen3-0.6B), an embeddings model (embed-gemma-300m-FLM), and an audio generation model (ThinkSound-SFX). Evidence: `GET /v1/models` returns 20 entries with distinct ids.

2. **§1: Table of 4 models is incomplete.** The table lists only the original GGUF fleet. The live system includes FLM/NPU, embeddings, audio, and additional vision models. The table should be treated as a historical snapshot, not the current state.

3. **§8 checklist: "4 model ids"** should read "20 model ids".

4. ~~**§8 checklist: "Lemonade/* entries in enabledModels"** — only 1 of 4 enabled … 3 of the 4 hand-maintained models are effectively dead.~~ **RETRACTED (owner, 2026-07-26)**: this is deliberate curation, not drift. `enabledModels` is the `/scopedModels` quick-select list; models absent from it are still usable. Nothing to fix; the extension must respect this curation mechanism.

5. **§6: pi-llama-cpp "still present as reference"** — it has been **pruned** from `~/.pi/agent/npm/node_modules/`. The reference source is no longer available locally. (The lemond source at `forte_local_ai/src/lemonade/` remains available for endpoint truth.)

6. **§0 gate test #1: "Does pi's openai-completions parse reasoning_content?"** — The answer is nuanced. pi **does** parse `reasoning_content` from responses (so thinking output is displayed), but the thinking **level control** is a no-op because the static provider doesn't set `compat.thinkingFormat: "qwen-chat-template"`. pi sends `reasoning_effort` (which lemond ignores) instead of `chat_template_kwargs.enable_thinking` (which lemond understands). See §Verified facts for the full trace.

7. **§3: Version** — Source `CMakeLists.txt` says `11.5.0`; running server reports `11.0.0`. The deployed binary lags the current source by at least one minor version.

8. **HANDOVER §3 / this file §Verified facts: `type` field does NOT exist.** Both documents claim `/api/v1/models` entries carry `type` (llm/embedding/…). Live re-verification (2026-07-26, v11.0.0) shows no `type` key on any of the 20 entries (union of keys: id, labels, recipe, downloaded, checkpoints, max_context_window, …). The chat-LLM filter must use `recipe` + exclusion `labels` instead — PLAN.md was corrected accordingly (commit 64eb308). Caught by the first implementation worker; the earlier ✅ on this claim in §Verified facts was wrong (the field list was asserted, evidently from source newer than the deployed binary, not from the live response).

9. **§2 §Lemond-specific: "Eviction-aware UX"** — `max_loaded_models` is per capability type (llm:1, image:1, embedding:1, etc.), not a single global cap. The eviction model is more nuanced than "1 model total."

## Open questions

Things that need an answer (from the owner, from pi docs, or from
experiment) before the assessment can be final.

1. ~~Is the thinking knob fix worth building for?~~ **RESOLVED**: yes — the toggle mechanism is live-verified (see second-pass verification). Remaining sub-question: does `enable_thinking:false` also work on the 3 big MoEs with `--reasoning-preserve`? (one cold-load test, do during implementation).

2. ~~Register all 20 or filter?~~ **RESOLVED (owner, 2026-07-26)**: filter to **chat LLMs only** (type=llm chat-capable, GGUF + FLM chat models; skip embeddings/whisper/audio/translate — ~12 models).

3. ~~In-pi load/unload wanted?~~ **DEFERRED (owner, 2026-07-26)**: not in v1.

4. ~~Extend pi-tps-meter or duplicate telemetry?~~ **DEFERRED (owner, 2026-07-26)**: telemetry surface not in v1.

5. ~~Upstream path?~~ **RESOLVED**: personal fork first (`git@github.com:ekenberg/pi-lemonade.git`, `live`/`main`), per HANDOVER §7.

6. ~~**NEW — `mtp` vs `reasoning` labels**~~ **RESOLVED (owner, 2026-07-26)**: assume **all registered chat models are reasoning-capable** (`reasoning: true` + `thinkingFormat: "qwen-chat-template"` blanket). No label trust, no override map, no heuristic, no server-side edits. Rationale: the mislabeling root cause is lemond's extra-models auto-labeler, which has no reasoning detection (labels are auto-derived: `vision` from mmproj, `mtp` from GGUF metadata, `tool-calling` from template) — the 3 big MoEs (`source: extra_models_dir` / imported without the flag) can never get the label without re-import or a lemond patch. Blanket-true failure modes are benign: a non-thinking model shows a no-op toggle (pi handles absent `reasoning_content` fine), and Jinja templates ignore an unreferenced `enable_thinking` kwarg. The label-trusting failure mode (silently losing thinking on the 3 main models) is worse. Residual check during implementation: FLM backend tolerates `chat_template_kwargs`. Optional long-term: teach lemond's auto-labeler to detect reasoning from the chat template (candidate for the lemonade contribution queue).

## Assessment

Address the decision gate from HANDOVER.md §0 explicitly:

- **How often does the lemond model set actually change?** It has changed **significantly** since handover. From 4 models to 20 in a short window. The fleet is NOT stable at 3–4 — it has grown to include FLM/NPU models, embeddings, audio, and additional vision models. The model set is **churny**, not stable. This is the strongest argument for auto-discovery.

- **Is pre-loading via `lemonade load` in a terminal acceptable, or is in-pi load/control wanted?** The 3 large MoE models (Qwen3.6-35B 23GB, Gemma4-26B 17GB, ThinkingCap-27B 16.5GB) take noticeable time to load cold. Pre-warming in a terminal works but requires context-switching. In-pi load control would be convenient but is a nice-to-have, not essential — lemond auto-loads on first request.

- **Does pi's `openai-completions` already parse `reasoning_content`, or is the thinking knob currently a no-op?** pi **does** parse `reasoning_content` (thinking output is displayed). However, the thinking **level control** is a no-op: the static provider doesn't set `compat.thinkingFormat: "qwen-chat-template"`, so pi sends `reasoning_effort` (which lemond ignores) instead of `chat_template_kwargs.enable_thinking` (which lemond understands). Thinking is always ON server-side via `--reasoning-preserve`. An extension could fix this with one `compat` field per model.

- **Is the status/telemetry surface something the owner looks at inside pi, or is `lemonade status` enough?** pi-tps-meter already provides client-side TPS in the footer. The gap is TTFT and VRAM/load status. Whether this is worth an in-pi surface depends on the owner's workflow — it's a UX preference, not a functional gap.

## Recommendation

**Build** — v1 scoped to **core only** per owner decision (see §Decision); lemond-specific items (load/unload, telemetry, device badges) deferred.

Rationale:

1. **Model set is churny, not stable** (20 models vs. HANDOVER's "3–4"). The static `models.json` is already out of date — only 1 of 4 Lemonade models is enabled, and 16 models served by lemond are not represented at all. Auto-discovery from `/api/v1/models` is the primary value driver.

2. **The thinking knob is broken on the static provider** — it sends `reasoning_effort` which lemond ignores. Setting `compat.thinkingFormat: "qwen-chat-template"` makes the toggle functional — **live-verified** on Qwen3-0.6B (see second-pass verification). This is a concrete bug the extension fixes, not just a nice-to-have.

3. **Capability inference is valuable** — lemond's `labels` (`vision`, `tool-calling`, `reasoning`, `mtp`, `audio`, `embeddings`, etc.) and `max_context_window` are richer than the hand-maintained static entries. Auto-inference eliminates drift.

4. **Load/unload control** is a genuine latency win for the 22–35B MoE models. The `model_name` key gotcha (HANDOVER §3) is confirmed — an extension handles this correctly.

5. **Status/telemetry** (health, stats, system-stats) is a secondary benefit. pi-tps-meter already covers TPS; the extension would add TTFT and VRAM/load visibility. This is the weakest argument and can be deferred.

The three gate tests from HANDOVER §0 resolve as:
- Test 1 (reasoning_content parsing): **Partially YES** — parsed but level control is a no-op without the right `thinkingFormat`.
- Test 2 (model set churn): **YES, churny** — 4→20 models.
- Test 3 (lemonade status vs in-pi): **Subjective** — in-pi adds TTFT + VRAM, but client-side TPS already works.

## If build: proposed scope & plan

- **Core** (auto-discovery + capability inference):
  - Async factory fetches `GET /api/v1/models`, filters to LLM chat-capable models (labels containing `tool-calling` or `reasoning` or `vision`, recipe `llamacpp` or `flm` with chat capability), maps labels → pi capabilities (`vision`→image input, `tool-calling`→tools, `reasoning`/`mtp`→reasoning model, `max_context_window`→contextWindow).
  - Sets `compat.thinkingFormat: "qwen-chat-template"` on reasoning models (fixes the no-op knob).
  - Registers via `pi.registerProvider("Lemonade", { baseUrl, api: "openai-completions", models })`.
  - Only hits `/api/` paths; treats `text/html` responses as absent (SPA trap rule).

- **Lemond-specific** (load control + telemetry):
  - `/lemonade-load` and `/lemonade-unload` commands calling `POST /api/v1/load` and `POST /api/v1/unload` with `model_name` key.
  - Status bar extension reading `/api/v1/health` (loaded model, device, pinned) + `/api/v1/stats` (TTFT, tokens/sec) + `/api/v1/system-stats` (VRAM, GPU/NPU). Poll on `message_start`/`message_end` (quiet paths, designed for polling).
  - Device labeling: badge NPU vs GPU models in the model selector.
  - Consider extending `pi-tps-meter` rather than duplicating the TPS display.

- **Deferred**:
  - Eviction-aware UX (warn/pin/pre-warm on model switch) — lemond auto-loads on first request; only saves latency.
  - Recipe-options twiddling — server is source of truth.
  - Multi-server `;`-joining — lemond is one server.

- **File layout**:
  ```
  pi-lemonade/
  ├── AGENTS.md          (exists, inherited)
  ├── HANDOVER.md        (exists, frozen input)
  ├── DISCOVERY.md       (this file)
  ├── package.json       (pi package manifest: pi.extensions → ["./src/index.ts"])
  ├── src/
  │   ├── index.ts       (async factory: discover + registerProvider)
  │   ├── lemonade-api.ts (typed wrappers for /api/v1/* endpoints)
  │   ├── capabilities.ts (label → pi capability mapping)
  │   ├── commands.ts     (load/unload commands + status bar)
  │   └── telemetry.ts    (health/stats/system-stats polling)
  ├── README.md
  └── DEV.md
  ```

- **Test approach**:
  - Unit: `capabilities.ts` label mapping (e.g., `["vision","tool-calling","reasoning"]` → `{input:["text","image"], reasoning:true, tools:true}`).
  - Integration: mock lemond `/api/v1/models` response, assert `registerProvider` receives correct model set + compat flags.
  - Live: `pi install ...@live` → `pi update --extensions` → fresh session → `/model` shows auto-discovered Lemonade models → `/lemonade-load Qwen3.6-35B-A3B-MTP-Uncensored` succeeds → status bar shows loaded model + VRAM.

- **Upstream path**: Personal fork first (`git@github.com:ekenberg/pi-lemonade.git`, `live`/`main`), matching the `pi-tts`/`pi-model-annotation` pattern. Offer upstream once solid.

## Decision

Owner's call (Johan, 2026-07-26):

- **BUILD.**
- **v1 scope: core only** — auto-discovery from `/api/v1/models`, label→capability
  inference, `compat.thinkingFormat: "qwen-chat-template"` on reasoning-capable
  models, registered via provider against `:13305/v1`.
- **Filter: chat LLMs only** (skip embeddings/transcription/audio/translate).
- **Deferred to v2+**: load/unload commands, status/telemetry surface, device
  badges (NPU/GPU), eviction-aware UX.
- **enabledModels curation is deliberate** (`/scopedModels`) — not drift; the
  extension registers models and leaves quick-select curation to pi.
- **Ownership**: personal fork `git@github.com:ekenberg/pi-lemonade.git`,
  `live`/`main` pattern, offer upstream once solid.

Implementation to-dos carried forward:
1. Cold-load test: `enable_thinking:false` on a big MoE with
   `--reasoning-preserve` (verify toggle works there too).
2. ~~Decide `mtp`→reasoning handling~~ **RESOLVED**: blanket `reasoning: true` on all registered chat models (see Open questions #6). Sub-check: FLM backend accepts `chat_template_kwargs` without error.
3. Replace the static `Lemonade` block in `~/.pi/agent/models.json` once the
   extension registers models (avoid duplicate provider entries).
