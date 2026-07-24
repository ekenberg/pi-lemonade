# AGENTS.md

`pi-lemonade` — a potential pi coding-agent extension that provides first-class
Lemonade Server (`lemond`) integration for pi, as a successor to the now-
incompatible bundled extension `pi-llama-cpp`.

## Current state: CONTEXT-GATHERING / DISCOVERY (not yet a build)

This repository is in an evaluation phase. No extension code exists yet. The
goal of this phase is to **gather context and decide** whether to build
`pi-lemonade`, and if so, to produce an actionable plan.

Two valid outcomes:
1. **Deferred** — the current static-provider workaround (see HANDOVER.md §1)
   is judged sufficient, and this project is shelved until a real need appears.
2. **Build** — discovery produces a concrete plan (scope, files, tests, upstream
   path) and the project moves into implementation.

Do **not** start writing extension code in this phase. Read HANDOVER.md fully,
verify its claims against the live system where feasible, and produce a written
assessment + recommendation. The owner (Johan) decides the outcome.

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

## How to proceed (this phase)

1. Read **HANDOVER.md** end to end.
2. Verify the live lemond facts against `http://localhost:13305` (see §3 for
   the exact endpoints; beware the SPA catch-all trap in §4).
3. Read the reference extension sources in §6 to confirm the pi extension
   shape and conventions.
4. Produce a written assessment: is the static provider enough, or is the
   extension worth building? If build: scope (core / lemond-specific /
   deferred), file layout, test approach, and upstream-vs-personal-fork
   recommendation.
5. Stop and present the assessment to the owner. Do not implement without
   approval.

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

- Do not write extension code in this phase.
- Do not edit pi's dist files (runtime patching, if ever needed, resolves host
  modules at runtime — see `pi-model-annotation`).
- Verify lemond endpoint claims by hitting them; never trust a `200` alone
  (SPA catch-all — see HANDOVER.md §4).
