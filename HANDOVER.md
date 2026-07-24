# HANDOVER.md — pi-lemonade context & reasoning

Status: context-gathering / discovery. Author: Johan (via the
`forte_local_ai` plan 58 session, 2026-07-25). Audience: a coding agent
picking up the evaluation. Read AGENTS.md first for the phase contract.

This file collects everything discussed + the implied context from the
originating `forte_local_ai` workspace. It is deliberately redundant in
places so it stands alone if the live session is gone.

---

## 1. Why this exists — the migration that broke pi-llama-cpp

On 2026-07-25, `forte_local_ai` plan 58 retired `llama-server` and migrated
the local LLM fleet to **Lemonade Server (`lemond`) v11.0.0** on
`http://localhost:13305`. The migrated models:

| Model id (lemond) | Type | MTP | Route into lemond |
|---|---|---|---|
| `Qwen3.6-35B-A3B-MTP-Uncensored` | MoE 35B | embedded | `extra_models_dir` copy |
| `Gemma4-26B-A4B-QAT-MTP-Uncensored` | MoE 26B (HauhauCS graft) | **external draft** | `lemonade import` JSON (HF cache) |
| `ThinkingCap-Qwen3.6-27B` | dense 27B | embedded | `extra_models_dir` copy |
| `qwen3vl-it-4b-FLM` | 4B | n/a | NPU / FLM backend (pre-existing) |

A 4th GGUF (`gemma-4-26B-A4B-it-qat-UD-Q4_K_XL`, stock unsloth) deliberately
stays on a disabled `llama-server` user-service as an upstream-repro asset
(`forte_local_ai` plan 16, mtmd mixed-dims bug). It is started on demand with
`systemctl --user start llama-server` and accessed on `:8020`.

The bundled pi extension **`pi-llama-cpp`** is now incompatible and has been
removed from pi's `packages` list. Chat + vision + reasoning currently work
through a **static custom provider** declared in `~/.pi/agent/models.json`
under the key `Lemonade` (`baseUrl: http://localhost:13305/v1`,
`api: openai-completions`, 4 hand-maintained model entries). That static
provider is the baseline to beat; if `pi-lemonade` is built, it should
subsume those entries via auto-discovery.

### What pi-llama-cpp did (the capabilities now lost)

It was a **discovery + capability layer** over pi's generic OpenAI provider,
not a chat re-implementation:

- URL resolution (project / env / global settings, `;`-joined multi-server).
- `GET /props` → server *mode* (`router`/`legacy`/`single`) → picked the
  matching model wrapper (`RouterModel`/`LegacyModel`/`SingleModel`).
- `GET /health` → readiness.
- `GET /v1/models` → **auto-listed models** (no hand-maintenance of entries).
- `POST /models/load` / `/models/unload` → explicit pre-load / free VRAM.
- thinking-budget mapping + async load-status polling.

Source (still installed, read-only reference): `~/.pi/agent/npm/node_modules/
pi-llama-cpp/` — `src/{constants,resolver,server}.ts`, `src/models/*`,
`src/interfaces/endpoints/*`. Its constants default to `:8080`; the live
config pointed it at `:8020` via `llamaServerUrl` in `~/.pi/agent/settings.json`.

The static `Lemonade` provider recovers chat/vision/reasoning flags but loses:
**auto-discovery, capability inference, health/load surfacing, explicit load
control.** Those four are what `pi-lemonade` would buy back.

---

## 2. What pi-lemonade should do (scope sketch)

### Core — the reason it exists
- **Auto-discover models** from lemond. Use the real endpoints (§3); never
  `/props` or `/health` (§4 trap). Register them as `openai-completions`
  models against `:13305/v1` — the extension contributes *models + metadata*,
  not a new API client.
- **Infer capabilities from labels** so `models.json` stops being
  hand-maintained. lemond's `/api/v1/models` returns per-model `labels`
  (`vision`, `tool-calling`, `mtp`, `reasoning`, `custom`, …) and
  `max_context_window`. Map: `vision`→image input, `tool-calling`→
  supports_tools/schema, `mtp`/`reasoning`→reasoning model,
  `max_context_window`→contextWindow. Our 3 GGUFs + FLM all derive from this.

### Lemond-specific — where it earns its keep beyond pi-llama-cpp
- **Explicit load/unload** via `/api/v1/load {model_name}` and
  `/api/v1/unload {model_name}`. Lets a user pre-warm a model before
  prompting (kills first-token latency on a cold 22G MoE) or free VRAM on
  demand. pi-llama-cpp had this; the static provider cannot.
- **Health/telemetry surfacing**: `/api/v1/health` exposes loaded models,
  pinned, `max_loaded_models`, eviction state, VRAM%. Feed a status line
  (there is an existing `pi-tps-meter` extension; either extend it or add a
  small lemonade status view). Right now that state is invisible inside pi.
- **Device labeling**: lemond's `all_models_loaded[].device` is `npu` vs
  `gpu`. Badge models "NPU" / "GPU" in the selector — on forte this is
  meaningful: NPU FLM models are the cheap/fast lane, iGPU GGUFs are the
  deep lane. Lets a user pick a 4B NPU model for autocomplete-shaped work
  and a 35B for reasoning, visibly.

### Nice-to-have, defer
- **Eviction-aware UX**: `max_loaded_models` is per capability type and
  defaults to 1 on forte, so switching LLMs evicts the warm one. Warn, pin
  the active model, or pre-warm on switch. lemond's auto-load is already
  transparent (first request triggers load), so this only saves first-token
  latency — do it later.
- **Recipe-options twiddling**: per-model sampling/ctx is stored server-side
  in `recipe_options.json`; could surface or edit from pi. Probably YAGNI;
  server is source of truth.
- **Thinking-level mapping**: pi's `thinkingBudgets` → lemond's
  `enable_thinking` / `chat_template_kwargs.preserve_thinking`. Worth getting
  right so pi's thinking knob actually drives the models — but first verify
  whether pi's `openai-completions` already parses `reasoning_content`; if it
  does, this is free. (Note: models are loaded with `--reasoning-preserve`
  on forte, so reasoning is on by default server-side regardless.)

### Skip
- SSE / streaming — pi's `openai-completions` already does it.
- A bespoke API client — use pi's generic provider under the hood.
- Multi-server `;`-joining — lemond is one server managing many backends;
  the old multi-llama-server need is gone.

### Honest gate before building
The static `models.json` provider works *right now* and the model set is
stable. The extension's value is auto-discovery + capability inference +
status surface. **If models change often or the owner wants load/VRAM
control from inside pi, build it. If the set stays at 3–4 and pre-loading via
`lemonade load` in a terminal is acceptable, the static provider may be
enough and the extension is premature.** Surface this trade-off explicitly in
the assessment.

---

## 3. lemond API surface (verified 2026-07-25)

Base: `http://localhost:13305`. lemond serves both `/v1/*` and `/api/v1/*`.

Real OpenAI-compatible (use these for chat):
- `GET  /v1/models` — OpenAI model list (`{data:[{id,…}]}`). Minimal fields.
- `POST /v1/chat/completions` — OpenAI chat. Works for all 4 models, vision
  (image_url parts), streaming, tool calls. Verified end-to-end from pi via
  the static provider.
- `GET  /v1/completions` — legacy completions (the migrated models also
  serve `/v1/completions` directly on the spawned llama-server backend at
  `:8001`, with `timings` including `draft_n`/`draft_n_accepted` for MTP
  inspection — but that backend port is an internal lemond detail, not a
  stable public surface).

Richer lemond-native (use these for discovery/status):
- `GET  /api/v1/models` — full model objects: `id`, `labels[]`,
  `checkpoints{main,draft,mmproj}`, `recipe_options`, `max_context_window`,
  `type` (llm/embedding/reranking/transcription/image/tts), `downloaded`.
  **This is the capability-inference source.**
- `GET  /api/v1/health` — `{status:"ok", all_models_loaded:[{model_name,
  device, loaded, pinned, recipe_options, …}], max_models{…},
  pinned_models{…}, telemetry, version}`. **This is the status/telemetry
  source.**
- `POST /api/v1/load` — body `{model_name, save_options?, ctx_size?,
  llamacpp_args?, llamacpp_backend?, downsize_idle_timeout?,
  evict_idle_timeout?, …}`. Returns `{status:"success", …}`. NB: key is
  `model_name`, **not** `model` (the generic OpenAI load shape is rejected
  with a confusing type-error). With `save_options:true` the supplied
  recipe_options are persisted to `recipe_options.json` for that model.
- `POST /api/v1/unload` — body `{model_name}`.
- CLI: `/opt/bin/lemonade` subcommands `import`, `load`, `unload`, `config`
  (`config set key=value`, `config` to view), `status`, … The CLI talks to
  the running server over the same API (so `lemonade config set` is a
  non-root way to mutate server config, unlike editing `config.json` which
  is owned by the `lemonade` user).

### Reserved/managed args (relevant if the extension ever sets llamacpp_args)
lemond manages some llama-server flags itself and rejects them if passed in
`llamacpp_args`: `--jinja`, `--ctx-size` (use `ctx_size`), `--mmproj`,
`--model`, `--port`, `--device`, embedding/rerank flags, `--spec-draft-model`
(alias of the managed `--model-draft`). It auto-adds `--spec-type draft-mtp`
+ defaults when a model has the `mtp` label. `llamacpp_args` is flag-level
merged (priority: request > per-model > arch > global).

---

## 4. The SPA catch-all trap (important)

lemond hosts its web-app on the same port. **Any unmatched route returns the
SPA `index.html` with HTTP 200**, not a 404. Concretely:

- `GET /health` → 200 + HTML (NOT llama-server's `{status:"ok"}` JSON)
- `GET /props?autoload=false` → 200 + HTML (NOT llama-server's props JSON)
- `GET /nonexistent-anything` → 200 + HTML

This is exactly why pi-llama-cpp cannot be pointed at lemond: its
`fetchServerHealth()` and `fetchServerProps()` would JSON-parse HTML and
throw; `initialize()` dies before models load. `GET /v1/models` is real JSON
but alone is insufficient for pi-llama-cpp's mode detection.

**Rule for pi-lemonade**: only hit the endpoints in §3. If a probe returns
`content-type: text/html`, treat the endpoint as absent. Never infer
availability from a bare `200`.

---

## 5. forte / lemond deployment context (the live system)

Relevant because device labeling, eviction, and the staged binary all affect
what the extension should surface or guard against.

- **Host**: `forte` — AMD Ryzen AI with Radeon 890M iGPU + NPU. gfx1150.
  Whole stack is **Vulkan-only** (ROCm/HIP deliberately avoided; see
  `forte_local_ai/docs/hardware.org`). Canonical hardware facts (memory
  topology, VRAM carveout) live there — never state memory numbers from
  memory.
- **lemond service**: systemd system unit `lemond.service`, `User=lemonade`,
  `ProtectHome=yes` (so `/home/johan` is invisible to it), config at
  `/opt/var/lib/lemonade/.cache/lemonade/config.json` (lemonade user's HOME
  is `/opt/var/lib/lemonade`, not `/var/lib/lemonade` as sysusers.d implies).
  Models live under `/opt/var/lib/lemonade/{extra-models,.cache/huggingface}`.
- **Custom llama.cpp binary**: lemond's bundled build (b9747) lacks our
  `mtmd` mixed-dims vision patch. A patched b9860 is staged at
  `/opt/llama-local/{bin,lib64}` (RUNPATH `$ORIGIN/../lib64`) and selected
  via `llamacpp.vulkan_bin` in `config.json`. This is a **temporary
  deviation** that self-retires once upstream llama.cpp has the mtmd fix AND
  lemond bumps its bundled build past it. The extension should not assume
  the bundled binary; it should not assume the staged one either — it just
  talks to lemond, which manages the binary.
- **Idle/eviction policy** (set 2026-07-25): global `auto_evict=true`;
  per-model `downsize_idle_timeout=3600` and `evict_idle_timeout=3600`
  (KV kept warm for the idle hour, then full unload). Pressure eviction at
  `auto_evict_threshold_pct=0.90` (90% global VRAM) is the emergency valve.
  `max_loaded_models=1` for llm — switching LLMs evicts the warm one.
- **NPU exclusivity**: on the NPU, `whispercpp` / `flm` / `ryzenai-llm` are
  mutually exclusive; FLM allows exactly 1 LLM + 1 ASR + 1 embedding. An NPU
  STT load evicts all FLM. Relevant if the extension ever surfaces NPU state.
- **Retired service**: `llama-server` is a **`--user`** systemd service
  (not system), now `inactive` + `disabled`. Rollback is
  `systemctl --user enable --now llama-server` (no sudo). The extension must
  not assume llama-server; if stock-gemma-on-:8020 ever matters, that's an
  ad-hoc manual start, not an extension concern.

Originating project: `~/srv/syncthing/projects/forte_local_ai/` — plan 58
(`plans/58-lemonade-fleet-migration.org`) is the full migration record;
plan 53 (`plans/53-lemonade-unified-hub.org`) is the broader evaluation that
scoped this work. Read those for the depth this file summarizes.

---

## 6. Reference points for the extension shape

- **`pi-llama-cpp`** (the thing being replaced): `~/.pi/agent/npm/node_modules/
  pi-llama-cpp/`. Structure: `src/{constants,resolver,server,index}.ts`,
  `src/models/{baseModel,routerModel,legacyModel,singleModel}.ts`,
  `src/interfaces/endpoints/{health,models,props}.ts`, `src/api/client.ts`,
  `src/sse/manager.ts`, `src/managers/*`. Its `package.json` is a pi package
  (`pi.extensions`, `peerDependencies` on `@earendil-works/pi-coding-agent`).
  The `resolver.ts` URL-resolution chain (project → env → global → default)
  and the `register_models` hook pattern are the reusable ideas.
- **`pi-tts`** (`~/projects/pi-tts/`): minimal personal-fork extension
  template. `index.ts` + `package.json` + `README.md` + `DEV.md` + `AGENTS.md`.
  Clean example of the `live`/`main` branch + `pi install ...@live` +
  `pi update --extensions` edit loop. Read its `AGENTS.md`/`DEV.md`.
- **`pi-model-annotation`** (`~/projects/pi-model-annotation/`): more complex
  extension with `src/`, runtime monkeypatching of pi internals, a `STATUS.md`
  handoff file, and a `PLAN-*.md`. Useful pattern if pi-lemonade needs to
  patch pi's model selector (e.g. for device badges).
- **pi docs**: `/home/johan/.local/share/fnm/node-versions/v24.17.0/
  installation/lib/node_modules/@earendil-works/pi-coding-agent/docs/` —
  `providers.md` (the `llama.cpp` and `Custom Providers` sections),
  `custom-provider.md`, `models.md`. These document the `models.json`
  custom-provider schema that the static workaround uses and that any
  extension would complement or replace.
- **pi settings**: `~/.pi/agent/settings.json` — `packages[]` (extension
  list; `pi-llama-cpp` was removed), `enabledModels[]`, `llamaServerUrl`
  (now stale), `thinkingBudgets`. `~/.pi/agent/models.json` — the live
  custom-provider declarations including the current `Lemonade` block.
- **lemond source** (for endpoint/behavior truth, not for editing):
  `~/srv/syncthing/projects/forte_local_ai/src/lemonade/` (cloned, gitignored
  in that project). Relevant files: `src/cpp/server/{server,model_manager,
  runtime_config,backend_manager,eviction_engine}.cpp`,
  `src/cpp/server/backends/llamacpp/{llamacpp_server,llamacpp_gguf}.cpp`,
  `docs/guide/configuration/{README,multi-model}.md`.

---

## 7. Upstream / ownership question

Two paths, to present in the assessment:
1. **Personal fork** (`git@github.com:ekenberg/pi-lemonade.git`, `live`/`main`
   branches) — matches the owner's existing `pi-tts` / `pi-model-annotation` /
   `pi-openrouter-plus` pattern. Fast, owner-controlled, iterate freely.
2. **Upstream to pi** — `pi-llama-cpp` is a bundled npm extension; a
   `pi-lemonade` (or a "lemonade mode" in a renamed `pi-local-llm`) would
   benefit every lemond user, and Lemonade is the AMD-blessed local stack.
   More review friction.

Given the originating project's "less tinkering, upstream-friendly" lean, a
reasonable recommendation is: build clean as a personal fork first (proves
the design on forte), then offer upstream once solid — the same cadence as
the `mtmd`/`voxtype`/lemonade-S3 contribution queue already in flight in
`forte_local_ai`.

---

## 8. Related but separate threads (do not conflate)

- **`forte_local_ai` plan 58 S3** — an upstream-only Lemonade patch to make
  `extra_models_dir` auto-detect `mtp-*` draft files (mirrors mmproj
  auto-detect). Parked, no hurry. Independent of pi-lemonade; mentioned only
  because both touch the same Lemonade codebase.
- **`pi-tps-meter`** — an already-installed pi extension for tokens/sec. If
  pi-lemonade surfaces telemetry, decide whether to extend this vs add a
  parallel status view. Don't duplicate.
- **`llm-status`** (`forte_local_ai/tools/llm-status`) — a CLI that validated
  `models.ini` against on-disk GGUFs and the live llama-server. Now
  partially obsolete (fleet gone); its fate is a separate open decision in
  plan 58, not pi-lemonade's concern.

---

## 9. Verification checklist for the discovering agent

Before trusting anything in this file, confirm:
- [ ] `GET http://localhost:13305/v1/models` returns JSON with the 4 model ids.
- [ ] `GET http://localhost:13305/api/v1/models` returns richer objects with
      `labels` and `max_context_window`.
- [ ] `GET http://localhost:13305/api/v1/health` returns `{status:"ok",…}`.
- [ ] `GET http://localhost:13305/health` and `/props?autoload=false` return
      **HTML** with HTTP 200 (the SPA trap — prove it to yourself).
- [ ] `POST http://localhost:13305/v1/chat/completions` round-trips a prompt
      on `Qwen3.6-35B-A3B-MTP-Uncensored`.
- [ ] `~/.pi/agent/models.json` has a `Lemonade` provider block with 4 models.
- [ ] `~/.pi/agent/settings.json` no longer lists `pi-llama-cpp` in
      `packages` and has `Lemonade/*` entries in `enabledModels`.
- [ ] `~/.pi/agent/npm/node_modules/pi-llama-cpp/` still exists as read-only
      reference (or note if it has been pruned).
