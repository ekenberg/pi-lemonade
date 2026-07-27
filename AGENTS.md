# AGENTS.md

`pi-lemonade` — a potential pi coding-agent extension that provides first-class
Lemonade Server (`lemond`) integration for pi, as a successor to the now-
incompatible bundled extension `pi-llama-cpp`.

## Current state: SHIPPED (v1 + v1.1), in use

The extension is built, reviewed, installed, and working. Both `PLAN.md` (v1)
and `PLAN-STATUS.md` (v1.1) are completed specs kept for history — do not
re-execute them.

- **v1 — auto-discovery**: `/api/v1/models` → chat-LLM filter → capability
  inference → registered as an `openai-completions` provider (`lemonade`)
  against `:13305/v1`. Every model gets `reasoning: true` +
  `compat.thinkingFormat: "qwen-chat-template"` (blanket decision, DISCOVERY
  §Decision). Independently reviewed, one blocker fixed.
- **v1.1 — `/lemonade-status`**: read-only auto-refreshing overlay showing
  residency, last-call telemetry, and system gauges. Independently reviewed,
  two defects fixed.
- **Cutover done**: the static `Lemonade` block was removed from
  `~/.pi/agent/models.json` (backups `*.bak-pre-lemonade-cutover-*`).
- **Verified**: the thinking toggle works end-to-end; `--reasoning-preserve`
  does *not* force thinking on (DISCOVERY claimed otherwise — corrected).

Still deferred: load/unload commands, device (NPU/GPU) badges, eviction-aware
UX, upstreaming to pi, and fixing lemond's own auto-labeler so the blanket
`reasoning: true` workaround can retire. See README §v1 scope and the end of
DISCOVERY.md §Decision.

HANDOVER.md is the frozen original context (several claims since corrected);
DISCOVERY.md records verified facts, corrections, and the decision. Treat
DISCOVERY over HANDOVER on any conflict.

**Model counts in the docs are snapshots, not invariants.** The lemond fleet
changed twice during development (4 → 20 → 9 models); the plans' acceptance
numbers reflect the fleet on the day they were written. Verify against
`npm run dry-run`, never against a number in a document.

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

## How to proceed (maintenance / next feature)

1. Read **DEV.md** first — it holds the edit loop, local checks, and the
   hard-won gotchas (Kitty-protocol key matching, pi-tui import rules,
   grapheme-aware width measurement). Those three have each already cost a
   bug.
2. Only hit the `/api/`-prefixed and `/v1/*` endpoints listed in HANDOVER §3;
   treat any `text/html` response as "endpoint absent" (SPA trap, §4). Note
   `/api/v1/models` has **no** `type` field — filter on `recipe` + `labels`.
3. Before changing rendering, run the local checks in DEV.md §Local checks;
   `npm run dry-run` is the fastest end-to-end signal.
4. For any non-trivial change, use a fresh-context reviewer subagent before
   shipping. Self-review demonstrably missed real defects in this repo twice —
   including a test suite that reimplemented the same flawed width metric as
   the code under test, making the bug undetectable by construction.

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
