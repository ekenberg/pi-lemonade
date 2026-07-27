# DEV.md

## Edit loop

This is a `pi`-installed extension, not something pi runs directly from this
checkout. The loop is:

1. Edit source here.
2. `git add -A && git commit -m "..." && git push origin live`
3. `pi update --extensions` (re-clones/updates
   `~/.pi/agent/git/github.com/ekenberg/pi-lemonade/`).
4. Test in a fresh `pi` session.

`main` is the stable snapshot branch, published via
`git push origin live:main` once `live` is solid.

## Local checks

```
npm install         # typescript only (peerDependencies auto-resolve too)
npm run typecheck    # tsc --noEmit
npm test             # node --test test/*.test.ts
npm run dry-run       # live discovery against http://localhost:13305,
                       # no pi involved — override with LEMONADE_URL
```

`npm run dry-run` requires a running Lemonade Server; against the current
live fleet (v11.0.0, 20 models total) it prints 17 registered chat models
and excludes `ThinkSound-SFX`, `embed-gemma-300m-FLM`, and
`whisper-v3-turbo-FLM`.

## Carried-forward verifications (from DISCOVERY.md §Decision)

- [x] **Cold-load test — PASSED (2026-07-26).** Direct A/B on
      `Qwen3.6-35B-A3B-MTP-Uncensored` (which carries `--reasoning-preserve`):
      baseline request → 343 chars of `reasoning_content`; with
      `chat_template_kwargs:{enable_thinking:false}` → 0 chars; same result
      with `preserve_thinking:true` added (the exact payload pi sends).
      End-to-end through pi with `--thinking off` → clean answer, no thinking
      block. Conclusion: `--reasoning-preserve` does **not** force thinking
      on; it concerns preserving reasoning across turns. DISCOVERY.md's
      original "thinking always ON server-side" claim was wrong.
- [x] **FLM tolerance — PASSED (2026-07-26).** `qwen3-it-4b-FLM`,
      `translategemma-4b-FLM`, and `Qwen3-0.6B-GGUF` all ran through pi with
      `chat_template_kwargs` present; no errors. Toggle verified on the wire
      via a logging proxy: `--thinking off` → `enable_thinking:false`,
      `--thinking high` → `enable_thinking:true`, no stray `reasoning_effort`.

Cutover completed 2026-07-26: the static `Lemonade` provider block was
removed from `~/.pi/agent/models.json` and the stale
`Lemonade/qwen3vl-it-4b-FLM` entry in `enabledModels` was lowercased.
Backups: `models.json.bak-pre-lemonade-cutover-*`,
`settings.json.bak-pre-lemonade-cutover-*`.

## Notes on implementation choices not spelled out in PLAN.md

- `tsconfig.json` adds `"lib": ["es2022", "dom"]` and
  `"allowImportingTsExtensions": true` beyond PLAN.md's literal list — the
  DOM lib supplies `fetch`/`Response`/`Headers`/`AbortSignal` types (Node's
  built-in fetch matches the WHATWG shape) and the latter is required by
  `nodenext` + explicit `.ts` import specifiers with `noEmit: true`.
  `src/global.d.ts` and `test/global.d.ts` add minimal local ambient
  declarations for `process`, `node:test`, and `node:assert/strict` instead
  of pulling in `@types/node`, keeping `typescript` the only devDependency
  per the hard constraints.
- `package.json`'s `test` script uses `node --test test/*.test.ts` instead
  of the literal `node --test test/` from PLAN.md Step 1: on this Node
  v24.17.0 install, `node --test test/` (bare directory argument) fails
  with `MODULE_NOT_FOUND` rather than discovering files in the directory;
  the glob form works and is what CI/local runs should use.

## `/lemonade-status` overlay (v1.1)

Modules:

- `src/lemonade-api.ts` — adds `fetchHealth`, `fetchStats`,
  `fetchSystemStats`, all sharing the never-throw / content-type-guarded
  contract of `fetchLemonadeModels`.
- `src/status-format.ts` — pure rendering. `renderStatus(snapshot, width,
  theme)` returns exact-width lines and never throws for any combination of
  null/missing fields. No pi imports, so it is fully unit-testable; the real
  pi theme satisfies the small `StatusTheme` interface and tests pass an
  identity implementation.
- `src/status-command.ts` — registers `/lemonade-status` and drives the
  overlay: 1 s interval, in-flight guard so slow responses cannot overlap, and
  a `closed` flag so no state is written after the overlay closes.

Deliberate decisions:

- **No bars for RAM/VRAM.** lemond reports `memory_gb` / `vram_gb` usage but
  no total, so a bar would need an invented denominator. Only the three real
  percentages (cpu/gpu/npu) get gauges. On this host the point is sharp: the
  iGPU exposes 0.5 GB dedicated VRAM plus ~72 GB GTT, so no single "total" is
  even meaningful.
- **Command registered unconditionally**, even when discovery found no models
  — diagnosing that case is exactly what the status view is for.

Regression watch: both box corners (`╮`, `╯`) were lost once to off-by-one
truncation in `fitWidth`. The bottom border now has a single `footer()` source
of truth, and `test/status-format.test.ts` asserts all four corners in all
four states.

### Key handling gotcha (cost one killed pi process)

pi enables the **Kitty keyboard protocol** on terminals that support it, so
Escape does not arrive as a bare `\x1b` — it can be `\x1b[27u` (or
`\x1b[27;1u`, or a modifyOtherKeys form). Comparing raw bytes silently fails
and leaves an overlay unclosable.

Always match keys with `matchesKey` from `@earendil-works/pi-tui`. It accepts
all forms, including single letters (`matchesKey(data, "r")` also matches
`\x1b[114u`). Verified directly against pi's `dist/keys.js`.

That bare specifier is resolved by **pi's own loader** at runtime; plain `node`
cannot resolve it from the installed extension directory, and it must not be
added to `dependencies`. It is declared ambiently in `src/global.d.ts`. Sibling
extensions (`pi-tts`, `pi-openrouter-plus`) import it the same way.

Note the blast radius: a failed top-level import of pi-tui breaks the entire
extension, not just the overlay. After changing such an import, verify with
`pi --list-models | grep -c '^lemonade'` (models registering proves the module
graph loaded).

### Width measurement must be grapheme-aware

`status-format.ts` deliberately does not import pi-tui (it must stay loadable
by plain `node` for tests), so it carries its own `visibleWidth`. That helper
is exported **so tests can pin it against hand-computed column counts** — the
original version measured UTF-16 `.length`, and the test file reimplemented
the same flawed metric, which made every width assertion structurally unable
to detect wide-character overflow (a CJK model name overflowed the box by 4
columns while tests reported the invariant satisfied).

It now segments with `Intl.Segmenter` (grapheme clusters) and applies an
East-Asian-Width table, so a ZWJ emoji family, a flag, and a combining accent
each count correctly. Never assert widths in tests with a locally redefined
metric; import `visibleWidth` and pin expected values by hand.
