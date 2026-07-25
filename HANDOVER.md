# HANDOVER.md — pi-lemonade context & reasoning

Status: context-gathering / discovery. Author: Johan (via the `forte_local_ai`
plan 58 session, 2026-07-25). Audience: a coding agent picking up the
evaluation. Read AGENTS.md first for the phase contract.

Scope note: this file covers what an extension **talking HTTP to lemond**
needs. Host and deployment detail is NOT duplicated here — it lives in
`forte_local_ai` (see §5) and would only rot in this repo.

---

## 0. The decision gate (read this first)

The static `models.json` provider **works right now** and the model set is
stable at 3–4. The extension's value is auto-discovery + capability inference
+ status/load surface. So:

- **Build** if the model set churns, or if load/VRAM control from inside pi is
  genuinely wanted, or if a status surface (loaded model, device, VRAM) is
  something the owner would actually look at while working.
- **Defer** if the set stays at 3–4 and pre-warming with `lemonade load` in a
  terminal is acceptable.

Three cheap tests decide most of it:
1. Does pi's `openai-completions` parse `reasoning_content`? If not, the
   thinking knob is cosmetic and one pillar of the value drops.
2. How often has the model set actually changed? (Check `forte_local_ai` plan
   history rather than guessing.)
3. Is `lemonade status` in a terminal genuinely worse, for this owner, than an
   in-pi status line?

Everything below is input to that gate, not a decision to build.

---

## 1. Why this exists — the migration that broke pi-llama-cpp

On 2026-07-25, `forte_local_ai` plan 58 retired `llama-server` and moved the
local LLM fleet to **Lemonade Server (`lemond`) v11.0.0** on
`http://localhost:13305`. Models served:

| Model id (lemond) | Shape |
|---|---|
| `Qwen3.6-35B-A3B-MTP-Uncensored` | MoE 35B, vision, reasoning |
| `Gemma4-26B-A4B-QAT-MTP-Uncensored` | MoE 26B, vision, reasoning |
| `ThinkingCap-Qwen3.6-27B` | dense 27B, vision, reasoning |
| `qwen3vl-it-4b-FLM` | 4B, NPU (FLM backend) |

`GET /api/v1/models` is authoritative — treat the table as a sanity check, not
a source.

The bundled pi extension **`pi-llama-cpp`** is incompatible with lemond and has
been removed from pi's `packages`. Chat + vision + reasoning currently work via
a **static custom provider** in `~/.pi/agent/models.json` under the key
`Lemonade` (`baseUrl: http://localhost:13305/v1`, `api: openai-completions`,
4 hand-maintained entries). **That static provider is the baseline to beat.**

### What pi-llama-cpp did (the capabilities now lost)

It was a discovery + capability layer over pi's generic OpenAI provider, not a
chat re-implementation:

- URL resolution (project / env / global settings, `;`-joined multi-server)
- `GET /props` → server *mode* (`router`/`legacy`/`single`) → matching model
  wrapper; `GET /health` → readiness
- `GET /v1/models` → auto-listed models (no hand-maintained entries)
- `POST /models/load` / `/models/unload` → explicit pre-load / free VRAM
- thinking-budget mapping + async load-status polling

Source (installed, read-only reference): `~/.pi/agent/npm/node_modules/pi-llama-cpp/`.
Its constants default to `:8080`; the live config pointed it at `:8020` via
`llamaServerUrl` in `~/.pi/agent/settings.json`.

The static provider recovers chat/vision/reasoning flags but loses
**auto-discovery, capability inference, health/load surfacing, explicit load
control** — those four are what `pi-lemonade` would buy back.

---

## 2. What pi-lemonade should do (scope sketch)

### Core — the reason it exists
- **Auto-discover models** from lemond. Use the real endpoints (§3); never
  `/props` or `/health` (§4 trap). Register them as `openai-completions` models
  against `:13305/v1` — the extension contributes *models + metadata*, not a
  new API client.
- **Infer capabilities from labels** so `models.json` stops being
  hand-maintained. `/api/v1/models` returns per-model `labels` (`vision`,
  `tool-calling`, `mtp`, `reasoning`, `custom`, …) and `max_context_window`.
  Map: `vision`→image input, `tool-calling`→tools/schema, `mtp`/`reasoning`→
  reasoning model, `max_context_window`→contextWindow.

### Lemond-specific — where it earns its keep beyond pi-llama-cpp
- **Explicit load/unload** via `/api/v1/load {model_name}` and
  `/api/v1/unload {model_name}`: pre-warm before prompting (kills first-token
  latency on a cold 22G MoE) or free VRAM on demand.
- **Health/telemetry surfacing**: `/api/v1/health` exposes loaded models,
  pinned state, `max_loaded_models`, eviction state, VRAM%. Feed a status line
  — note `pi-tps-meter` is already installed; extend it rather than duplicate.
- **Device labeling**: `all_models_loaded[].device` is `npu` vs `gpu`. Badging
  models in the selector makes the cheap-NPU / deep-iGPU choice visible.

### Nice-to-have, defer
- **Eviction-aware UX**: `max_loaded_models` defaults to 1 per capability type,
  so switching LLMs evicts the warm one. Warn / pin / pre-warm on switch.
  lemond auto-loads on first request already, so this only buys latency.
- **Recipe-options twiddling**: per-model sampling/ctx lives server-side in
  `recipe_options.json`. Probably YAGNI — server is source of truth.
- **Thinking-level mapping**: pi's `thinkingBudgets` → lemond's
  `enable_thinking` / `chat_template_kwargs.preserve_thinking`. Gate test #1
  (§0) decides whether this is free or needed.

### Skip
- SSE / streaming — pi's `openai-completions` already does it.
- A bespoke API client — use pi's generic provider underneath.
- Multi-server `;`-joining — lemond is one server managing many backends.

---

## 3. lemond API surface (verified 2026-07-25)

Base: `http://localhost:13305`. lemond serves both `/v1/*` and `/api/v1/*`.

Real OpenAI-compatible (use these for chat):
- `GET  /v1/models` — OpenAI model list (`{data:[{id,…}]}`). Minimal fields.
- `POST /v1/chat/completions` — OpenAI chat. Works for all 4 models, vision
  (image_url parts), streaming, tool calls. Verified end-to-end from pi via the
  static provider.
- `GET  /v1/completions` — legacy completions. (The spawned llama-server
  backend also serves this on an internal port with `timings` incl.
  `draft_n`/`draft_n_accepted` for MTP inspection — internal detail, not a
  stable public surface.)

Richer lemond-native (use these for discovery/status):
- `GET  /api/v1/models` — full objects: `id`, `labels[]`,
  `checkpoints{main,draft,mmproj}`, `recipe_options`, `max_context_window`,
  `type` (llm/embedding/reranking/transcription/image/tts), `downloaded`.
  **This is the capability-inference source.**
- `GET  /api/v1/health` — `{status:"ok", all_models_loaded:[{model_name,
  device, loaded, pinned, recipe_options, …}], max_models{…}, pinned_models{…},
  telemetry, version}`. **This is the status/telemetry source.**
- `POST /api/v1/load` — body `{model_name, save_options?, ctx_size?,
  llamacpp_args?, llamacpp_backend?, downsize_idle_timeout?,
  evict_idle_timeout?, …}` → `{status:"success", …}`. NB: the key is
  `model_name`, **not** `model` (the OpenAI shape is rejected with a confusing
  type-error). `save_options:true` persists the supplied recipe_options.
- `POST /api/v1/unload` — body `{model_name}`.
- CLI: `/opt/bin/lemonade` (`import`, `load`, `unload`, `config`, `status`, …)
  talks to the running server over the same API — so `lemonade config set` is
  the non-root way to mutate server config.

### Reserved/managed args (only if the extension ever sets llamacpp_args)
lemond manages some llama-server flags itself and rejects them in
`llamacpp_args`: `--jinja`, `--ctx-size` (use `ctx_size`), `--mmproj`,
`--model`, `--port`, `--device`, embedding/rerank flags, `--spec-draft-model`
(alias of managed `--model-draft`). It auto-adds `--spec-type draft-mtp` +
defaults for `mtp`-labelled models. `llamacpp_args` is flag-level merged
(priority: request > per-model > arch > global).

---

## 4. The SPA catch-all trap (important)

lemond hosts its web-app on the same port. **Any unmatched route returns the
SPA `index.html` with HTTP 200**, not a 404:

- `GET /health` → 200 + HTML (NOT llama-server's `{status:"ok"}` JSON)
- `GET /props?autoload=false` → 200 + HTML (NOT llama-server's props JSON)
- `GET /nonexistent-anything` → 200 + HTML

This is exactly why pi-llama-cpp cannot be pointed at lemond: its
`fetchServerHealth()` / `fetchServerProps()` would JSON-parse HTML and throw,
so `initialize()` dies before models load.

**Rule for pi-lemonade**: only hit the endpoints in §3. If a probe returns
`content-type: text/html`, treat the endpoint as absent. Never infer
availability from a bare `200`.

---

## 5. Server behaviour the extension must respect

Only the facts that constrain an HTTP client. Everything else about the host
lives in `forte_local_ai` and must be read there, live — not copied here.

- **lemond owns the backend binary and its flags.** Which llama.cpp build runs
  is server config; the extension never inspects or assumes it.
- **One LLM resident at a time** (`max_loaded_models` is per capability type,
  currently 1). Switching LLMs evicts the warm one; loads are transparent but
  slow on a cold ~20G model.
- **Idle eviction is on.** Models unload after an idle period, so "was loaded a
  minute ago" is not a guarantee. Query `/api/v1/health`, don't cache.
- **Devices are `gpu` and `npu`** and mean different things (iGPU GGUFs vs FLM
  NPU models) — relevant only for labelling.
- **Server config is server-side**, mutated via `lemonade config set` or the
  API. Never edit lemond's config files from an extension.

Depth: `~/srv/syncthing/projects/forte_local_ai/` — plan 58
(`plans/58-lemonade-fleet-migration.org`) is the migration record, plan 53
(`plans/53-lemonade-unified-hub.org`) the broader evaluation. Read those if you
need the "why"; do not copy their contents back into this repo.

---

## 6. Reference points for the extension shape

- **`pi-llama-cpp`** (what's being replaced):
  `~/.pi/agent/npm/node_modules/pi-llama-cpp/` — `src/{constants,resolver,server,index}.ts`,
  `src/models/*`, `src/interfaces/endpoints/*`. Reusable ideas: the
  `resolver.ts` URL chain (project → env → global → default) and the
  `register_models` hook pattern.
- **`pi-tts`** (`~/projects/pi-tts/`): minimal personal-fork template; read its
  `AGENTS.md`/`DEV.md` for the `live`/`main` + `pi update --extensions` loop.
- **`pi-model-annotation`** (`~/projects/pi-model-annotation/`): heavier
  extension with `src/`, runtime patching of pi internals — the pattern to copy
  if device badges require touching pi's model selector.
- **pi docs**: `/home/johan/.local/share/fnm/node-versions/v24.17.0/installation/lib/node_modules/@earendil-works/pi-coding-agent/docs/`
  — `providers.md`, `custom-provider.md`, `models.md`.
- **pi config**: `~/.pi/agent/settings.json` (`packages[]`, `enabledModels[]`,
  `thinkingBudgets`, stale `llamaServerUrl`) and `~/.pi/agent/models.json` (the
  live `Lemonade` provider block).
- **lemond source** (endpoint truth, not for editing):
  `forte_local_ai/src/lemonade/` — `src/cpp/server/{server,model_manager,runtime_config,eviction_engine}.cpp`,
  `src/cpp/server/backends/llamacpp/*`, `docs/guide/configuration/*`.

---

## 7. Upstream / ownership

1. **Personal fork** (`git@github.com:ekenberg/pi-lemonade.git`, `live`/`main`)
   — matches the existing `pi-tts` / `pi-model-annotation` / `pi-openrouter-plus`
   pattern. Fast, owner-controlled.
2. **Upstream to pi** — `pi-llama-cpp` is a bundled extension; a `pi-lemonade`
   (or "lemonade mode" in a renamed `pi-local-llm`) would help every lemond
   user. More review friction.

Recommendation to weigh: build as a personal fork first, offer upstream once
solid — the same cadence as the other contribution queues in `forte_local_ai`.

---

## 8. Verification checklist for the discovering agent

Before trusting anything in this file, confirm:
- [ ] `GET :13305/v1/models` returns JSON with the 4 model ids.
- [ ] `GET :13305/api/v1/models` returns richer objects with `labels` and
      `max_context_window`.
- [ ] `GET :13305/api/v1/health` returns `{status:"ok",…}`.
- [ ] `GET :13305/health` and `/props?autoload=false` return **HTML** with HTTP
      200 (the SPA trap — prove it to yourself).
- [ ] `POST :13305/v1/chat/completions` round-trips a prompt on
      `Qwen3.6-35B-A3B-MTP-Uncensored`.
- [ ] `~/.pi/agent/models.json` has a `Lemonade` provider block with 4 models.
- [ ] `~/.pi/agent/settings.json` no longer lists `pi-llama-cpp` in `packages`
      and has `Lemonade/*` entries in `enabledModels`.
- [ ] `~/.pi/agent/npm/node_modules/pi-llama-cpp/` still exists as read-only
      reference (or note if it has been pruned).
- [ ] **Gate test**: does pi's `openai-completions` surface `reasoning_content`
      from these models? (§0, test 1.)
