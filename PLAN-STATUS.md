# PLAN-STATUS.md — `/lemonade-status` overlay (v1.1)

Audience: worker agent implementing, reviewer agent checking. Follow steps in
order; each has acceptance checks. The v1 extension already exists and works —
this is an additive feature. Do not change existing discovery behaviour.

## Context

- `AGENTS.md`, `PLAN.md` (v1 plan — its hard constraints still apply), `DEV.md`.
- Existing code: `src/lemonade-api.ts`, `src/capabilities.ts`, `src/index.ts`,
  `src/dry-run.ts`, tests in `test/`.
- pi TUI docs (read the overlay + component sections before writing UI code):
  `/home/johan/.local/share/fnm/node-versions/v24.17.0/installation/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`
- Reference overlay component (read it, mirror its shape):
  `/home/johan/.local/share/fnm/node-versions/v24.17.0/installation/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/overlay-test.ts`

## Hard constraints (inherited + new)

- Only `/api/` endpoints on `http://localhost:13305`; treat any non-JSON
  content-type as "endpoint absent" (SPA trap). Never trust a bare 200.
- Every fetch helper must be **never-throw**, returning `null` on any failure —
  same contract and style as the existing `fetchLemonadeModels`.
- The overlay must never throw and must never leave a timer running after it
  closes.
- Do not edit: `HANDOVER.md`, `AGENTS.md`, `DISCOVERY.md`, `PLAN.md`,
  `PLAN-STATUS.md`, `.pi/settings.json`, anything under `~/.pi/` or `/opt/`,
  anything outside the repo.
- No new npm runtime dependencies. `typescript` stays the only devDependency.
  Type-only imports from `@earendil-works/pi-coding-agent` /
  `@earendil-works/pi-tui` are fine (they are peer deps, present at runtime in
  pi), but **do not add them to `dependencies`**.
- Do not run git commit/push. Do not launch subagents.

## Verified API facts (live, 2026-07-26 — do not re-derive)

`GET /api/v1/health` →
```json
{ "status": "ok", "version": "11.0.0", "model_loaded": "Qwen3-0.6B-GGUF",
  "all_models_loaded": [ { "model_name": "Qwen3-0.6B-GGUF", "device": "gpu",
    "type": "llm", "status": "ready", "backend_health": "ready",
    "backend_alive": true, "backend_url": "http://127.0.0.1:8001/v1",
    "checkpoint": "unsloth/Qwen3-0.6B-GGUF:Q4_0", "max_context_window": 40960,
    "recipe": "llamacpp", "recipe_options": { "ctx_size": 40960,
    "llamacpp_args": "..." }, "pid": 2592273, "pinned": false, "loaded": true,
    "last_use": 244290274, "watchdog_reset": false } ],
  "max_models": { "llm": 1, "embedding": 1, "image": 1, "reranking": 1,
    "transcription": 1, "tts": 1 },
  "pinned_models": { "llm": 0, "embedding": 0, "image": 0, "reranking": 0,
    "transcription": 0, "tts": 0 },
  "telemetry": { "enabled": false }, "websocket_port": 9000 }
```
`all_models_loaded` is `[]` and `model_loaded` is `null` when nothing is
resident (lemond idle-evicts — this is the common case, handle it first-class).
It may contain more than one entry (one per capability type).

`GET /api/v1/stats` →
```json
{ "time_to_first_token": 7.841167872, "tokens_per_second": 16.45071085,
  "input_tokens": 5440, "output_tokens": 385, "prompt_tokens": 5440,
  "input_tokens_total": 219015, "output_tokens_total": 12489,
  "prompt_tokens_total": 219066, "request_count_total": 56 }
```

`GET /api/v1/system-stats` →
```json
{ "cpu_percent": 1.97, "gpu_percent": 11.0, "npu_percent": 0.0,
  "memory_gb": 12.6, "vram_gb": 3.11 }
```

All three are lemond "quiet polling" paths — designed to be polled on a timer.

## Design decisions (already made — implement literally)

- Command name: `lemonade-status`. Read-only; no load/unload actions.
- Rendered as an **overlay** (`ctx.ui.custom(..., { overlay: true })`).
- **Auto-refresh every 1000 ms**, plus manual `r`. `esc` closes.
- **Show everything** — no field hidden. Sections: header, loaded model(s),
  residency, last call, totals, system.
- Bars **only for the three percentages** (0–100 is a real scale). RAM and VRAM
  print as plain numbers — lemond exposes no total, so a bar would need an
  invented denominator. Do not invent one; do not read host files for it.

## Target layout

Fixed content width; the component receives `width` from the overlay and must
never exceed it (truncate long values, e.g. model names / backend urls).

```
╭─ Lemonade ──────────────────────────── v11.0.0 ● ok ─╮
│                                                      │
│  ● Qwen3-0.6B-GGUF                                   │
│    gpu · llm · ready · ctx 40960 · unpinned          │
│    pid 2592273 · http://127.0.0.1:8001/v1            │
│    unsloth/Qwen3-0.6B-GGUF:Q4_0                      │
│                                                      │
│  ─── Residency ────────────────────────────────────  │
│    llm 1/1 · embedding 0/1 · image 0/1               │
│    reranking 0/1 · transcription 0/1 · tts 0/1       │
│    pinned: none                                      │
│                                                      │
│  ─── Last call ────────────────────────────────────  │
│    TTFT      7.84 s                                  │
│    Speed     16.5 tok/s                              │
│    Tokens    5440 in → 385 out                       │
│                                                      │
│  ─── Totals ───────────────────────────────────────  │
│    Requests  56                                      │
│    Tokens    219015 in → 12489 out                   │
│                                                      │
│  ─── System ───────────────────────────────────────  │
│    CPU  [██░░░░░░░░░░░░░░░░░░]   2%                  │
│    GPU  [████░░░░░░░░░░░░░░░░]  11%                  │
│    NPU  [░░░░░░░░░░░░░░░░░░░░]   0%                  │
│    RAM   12.6 GB      VRAM  3.1 GB                   │
│                                                      │
╰─ auto-refresh 1s · r refresh · esc close ────────────╯
```

States:
- **Nothing resident**: replace the model block with
  `○ no model resident` and a dim second line
  `lemond idle-evicts; next request auto-loads`. All other sections still render.
- **Multiple resident models**: repeat the 4-line model block per entry.
- **Server unreachable** (health fetch returns null): render a small box with
  `● lemonade unreachable at <baseUrl>` in the error colour, plus the
  esc/refresh footer. Do not throw, do not show stale numbers.
- **Partial failure** (e.g. stats null but health ok): render available
  sections; show `—` for the missing values rather than dropping the section.

## Steps

### Step 1 — API helpers in `src/lemonade-api.ts`

Add, mirroring the existing never-throw style (reuse the shared guard logic;
factor a private `fetchJson<T>(url)` helper if it reduces duplication — that
refactor is allowed as long as `fetchLemonadeModels` behaviour and its tests
are unchanged):

- `export interface LemonadeLoadedModel { model_name: string; device?: string; type?: string; status?: string; backend_url?: string; checkpoint?: string; max_context_window?: number; pid?: number; pinned?: boolean; }`
- `export interface LemonadeHealth { status?: string; version?: string; model_loaded?: string | null; all_models_loaded: LemonadeLoadedModel[]; max_models?: Record<string, number>; pinned_models?: Record<string, number>; }`
- `export interface LemonadeStats { time_to_first_token?: number; tokens_per_second?: number; input_tokens?: number; output_tokens?: number; input_tokens_total?: number; output_tokens_total?: number; request_count_total?: number; }`
- `export interface LemonadeSystemStats { cpu_percent?: number; gpu_percent?: number; npu_percent?: number; memory_gb?: number; vram_gb?: number; }`
- `fetchHealth(baseUrl): Promise<LemonadeHealth | null>` — must coerce a
  missing/non-array `all_models_loaded` to `[]`.
- `fetchStats(baseUrl): Promise<LemonadeStats | null>`
- `fetchSystemStats(baseUrl): Promise<LemonadeSystemStats | null>`

Acceptance: `npx tsc --noEmit` = 0; existing tests still pass.

### Step 2 — `src/status-format.ts` (pure, fully testable)

No I/O, no pi imports. Exports:

- `export interface StatusSnapshot { baseUrl: string; health: LemonadeHealth | null; stats: LemonadeStats | null; system: LemonadeSystemStats | null; }`
- `export interface StatusTheme { fg(color: string, s: string): string; bold(s: string): string; }`
  (the real pi theme satisfies this; tests pass an identity implementation)
- `export function bar(percent: number | undefined, cells?: number): string` —
  `cells` default 20, clamp 0–100, `undefined` → all-empty bar. Uses `█`/`░`.
- `export function renderStatus(snapshot: StatusSnapshot, width: number, theme: StatusTheme): string[]`
  — produces the whole box per the layout above.

Rules `renderStatus` must obey:
- Every returned line has **visible width exactly `width`** (pad or truncate;
  compute width ignoring ANSI — write a small local helper, do not import
  pi-tui here so the module stays dependency-free and testable).
- Never throws on any combination of null/missing fields.
- Numbers: TTFT 2 decimals + ` s`; tok/s 1 decimal; GB 1 decimal; token counts
  as plain integers; `—` when the value is missing.

Acceptance: `npx tsc --noEmit` = 0.

### Step 3 — `src/status-command.ts`

Exports `registerStatusCommand(pi, baseUrl)`, called from `src/index.ts`.

- `pi.registerCommand("lemonade-status", { description: "Show Lemonade Server status (loaded model, telemetry, system)", handler })`.
- Handler: `await ctx.ui.custom<void>((tui, theme, _kb, done) => component, { overlay: true, overlayOptions: { width: 58, anchor: "center" } })`.
- Component object `{ render, invalidate, handleInput }` (plus `dispose` if you
  keep one) that:
  - holds the latest `StatusSnapshot`, initially all-null;
  - kicks off an immediate refresh, then `setInterval(refresh, 1000)`;
  - `refresh()` fetches all three endpoints with `Promise.all`, guarded by an
    in-flight flag so slow responses cannot overlap; on completion updates the
    snapshot and calls `tui.requestRender()`; **ignores results after close**;
  - `handleInput`: `esc` → clear interval, `done()`; `r` → immediate refresh;
    everything else ignored;
  - `render(width)` → `renderStatus(snapshot, width, theme)`.
- The interval must be cleared on every exit path (esc, dispose). Use a
  `closed` flag checked before any post-fetch state update.
- Type the `pi`/`ctx` parameters loosely (as the existing `src/index.ts` does)
  or with `import type` from `@earendil-works/pi-coding-agent`. Do not add a
  runtime dependency.

Acceptance: `npx tsc --noEmit` = 0.

### Step 4 — wire into `src/index.ts`

Call `registerStatusCommand(pi, baseUrl)` **unconditionally** — the command must
exist even when discovery found no models (it is the tool for diagnosing
exactly that). Keep the existing provider-registration behaviour byte-identical
otherwise. Widen the `pi` parameter type to include `registerCommand`.

Acceptance: `npx tsc --noEmit` = 0; `npm run dry-run` output unchanged (17
models, same exclusions).

### Step 5 — tests `test/status-format.test.ts`

Using `node:test` + `node:assert/strict`, with an identity `StatusTheme`:
- `bar()`: 0 → no `█`; 100 → all `█`; 50 → half; `undefined` → all `░`;
  out-of-range 150 and -5 clamp.
- `renderStatus` with a full snapshot (use the verified sample data above):
  every line's visible width equals the requested width; output contains the
  model name, `gpu`, `ready`, `40960`, the TTFT and tok/s values, the totals,
  and the three gauge rows.
- `renderStatus` with `health.all_models_loaded: []` → contains
  `no model resident`, still renders the Residency/Last call/Totals/System
  sections.
- `renderStatus` with `health: null` → unreachable box, contains the baseUrl,
  no throw.
- `renderStatus` with `stats: null` but health+system present → renders `—`
  placeholders, no throw.
- `renderStatus` with two entries in `all_models_loaded` → both names appear.
- A narrow width (e.g. 30) → still exact-width lines, no crash (truncation).

Acceptance: `npm test` passes; total test count is the previous 14 plus your
new ones.

### Step 6 — docs

- `README.md`: document `/lemonade-status` under a "Commands" heading —
  what it shows, auto-refresh 1 s, `r`/`esc`, and that it is read-only.
  Move `/lemonade-status` out of the deferred list; keep load/unload, device
  badges, and eviction UX deferred.
- `DEV.md`: note the new modules, and the deliberate decision that RAM/VRAM
  have no bars because lemond exposes no total.

### Step 7 — final validation

1. `npx tsc --noEmit` → 0
2. `npm test` → all pass
3. `npm run dry-run` → still 17 models, same exclusions
4. `git status` → only expected files touched, no protected file modified

Report per-step status, test counts, and any deviations with justification.

## Reviewer notes

Check literally: never-throw on all three new fetchers **and** on
`renderStatus` for every null/partial combination; exact-width invariant for
every rendered line at several widths; the interval is cleared on every exit
path and no state is written after close (this is the most likely real defect —
trace it); command registered unconditionally; discovery behaviour unchanged;
no new runtime deps; layout matches the target including the empty-state and
unreachable-state wording. Run `npx tsc --noEmit`, `npm test`, `npm run dry-run`
yourself. Findings only — do not edit files.
