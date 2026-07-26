# AGENTS.md

`pi-lemonade` — a potential pi coding-agent extension that provides first-class
Lemonade Server (`lemond`) integration for pi, as a successor to the now-
incompatible bundled extension `pi-llama-cpp`.

## Current state: BUILD (v1, core scope)

Discovery is complete. The owner decided **Build** on 2026-07-26 — see
`DISCOVERY.md` §Decision for the recorded scope and rationale. Summary:

- **v1 = core only**: auto-discovery from `/api/v1/models`, label→capability
  inference, `compat.thinkingFormat: "qwen-chat-template"` on reasoning-capable
  models, registered as an `openai-completions` provider against `:13305/v1`.
- **Filter: chat LLMs only** (skip embeddings/transcription/audio/translate).
- **Deferred to v2+**: load/unload commands, telemetry/status surface, device
  badges, eviction-aware UX.
- Open implementation to-dos are listed at the end of DISCOVERY.md §Decision.

HANDOVER.md remains the frozen API/context reference; DISCOVERY.md records
verified facts, corrections, and the decision. Read both before implementing.

## What this project is about

`lemond` (Lemonade Server v11.0.0) now serves forte's local LLM fleet
(`forte_local_ai` plan 58, 2026-07-25): the previous `llama-server` router was
retired and its 3 GGUF models migrated to lemond. The bundled pi extension
`pi-llama-cpp` is **incompatible** with lemond (it speaks llama-server's
router-mode API, which lemond does not implement). Chat currently works through
a hand-maintained static custom provider in `~/.pi/agent/models.json`, but the
capabilities `pi-llama-cpp` used to provide — auto-discovery, capability
inference, health/load surfacing, explicit load control — are lost.

`pi-lemonade` would restore and exceed those capabilities using lemond's real
API surface. The full reasoning, API survey, capability mapping, and scope
options are in **HANDOVER.md** — read it before doing anything else.

## How to proceed (build phase)

1. Read **HANDOVER.md** (frozen — do not edit; corrections live in
   DISCOVERY.md §Discrepancies) and **DISCOVERY.md** (decision + verified
   facts + implementation to-dos).
2. Follow the proposed file layout and test approach in DISCOVERY.md
   §"If build", adjusted to the approved v1 core scope.
3. Only hit the `/api/`-prefixed and `/v1/*` endpoints listed in HANDOVER §3;
   treat any `text/html` response as "endpoint absent" (SPA trap, §4).
4. Resolve the carried-forward to-dos (big-MoE thinking toggle test,
   `mtp`→reasoning handling) during implementation and note outcomes in
   DEV.md.
5. When the extension registers models, retire the static `Lemonade` block in
   `~/.pi/agent/models.json` to avoid duplicates — coordinate with the owner.

## Conventions (inherited from sibling pi-* extensions)

- Personal git remote pattern: `git@github.com:ekenberg/pi-lemonade.git`,
  `live` branch for development, `main` for stable snapshots published via
  `git push origin live:main`. (See `~/projects/pi-tts/AGENTS.md` and
  `~/projects/pi-model-annotation/AGENTS.md` for the established pattern.)
- pi does not run code from this folder; `pi install ...@live` clones into
  `~/.pi/agent/git/github.com/ekenberg/pi-lemonade/` and runs from there. The
  edit loop is: edit → commit/push to `live` → `pi update --extensions` → test
  in a fresh pi session.
- Keep claims in README/DEV consistent with the actual install state in
  `~/.pi/agent/settings.json`.

## Hard rules

- Do not edit pi's dist files (runtime patching, if ever needed, resolves host
  modules at runtime — see `pi-model-annotation`).
- Verify lemond endpoint claims by hitting them; never trust a `200` alone
  (SPA catch-all — see HANDOVER.md §4).
