# PLAN.md — pi-lemonade v1 implementation (stepped, for delegated agents)

Audience: a worker agent implementing step by step, and a reviewer agent
checking the result. Follow steps in order. Each step has acceptance checks —
run them and report results. Do not skip checks.

## Context (read first, in this order)

1. `AGENTS.md` — phase contract (BUILD, v1 core scope).
2. `DISCOVERY.md` §Decision — the approved scope and resolved questions.
3. `HANDOVER.md` §3 (API surface) and §4 (SPA trap) — endpoint truth.

## Hard constraints (violations = review failure)

- **Only** talk to `http://localhost:13305`. Discovery uses
  `GET /api/v1/models`. Never probe `/health` or `/props` (bare paths serve
  the web-app SPA as HTML with HTTP 200 — see HANDOVER §4).
- If any HTTP response has `content-type` that is not `application/json`,
  treat the endpoint as absent. Never trust a bare 200.
- Do not edit: `HANDOVER.md`, `AGENTS.md`, `DISCOVERY.md`, anything under
  `~/.pi/`, anything under `/opt/`, anything outside this repository.
- Do not add npm runtime dependencies. Dev dependency: `typescript` only.
- Node is v24 — `node --test` runs `.ts` files natively (type stripping).
  Do not add a test framework.
- Extension code must never throw out of the factory: if lemond is down or
  returns garbage, log one warning and register nothing.

## Facts you need (verified 2026-07-26, do not re-derive)

`GET /api/v1/models` returns `{"data": [ ... ]}` where each entry has at
least: `id` (string), `type` (string: `llm` | `embeddings` | `reranking` |
`transcription` | `image` | `tts` | ...), `labels` (string array, may include
`vision`, `tool-calling`, `reasoning`, `mtp`, `custom`, ...), `downloaded`
(boolean), `recipe` (string), and optionally `max_context_window` (number).

Model mapping decisions (already made by the owner — implement exactly):

| pi model field | value |
|---|---|
| `id` | lemond `id`, unchanged |
| `name` | lemond `id`, unchanged |
| `reasoning` | **always `true`** (blanket decision, see DISCOVERY.md) |
| `input` | `["text","image"]` if labels include `vision`, else `["text"]` |
| `contextWindow` | `max_context_window`, or `32768` if missing |
| `maxTokens` | `32768` if `contextWindow >= 65536`, else `4096` |
| `cost` | all zeros |
| `compat` | `{ supportsStore: false, supportsDeveloperRole: false, maxTokensField: "max_tokens", thinkingFormat: "qwen-chat-template" }` |

Filter (chat LLMs only): keep a model iff `type === "llm"` **and**
`downloaded === true`. Nothing else. (~12 of 20 live models pass.)

Provider registration (see pi docs `docs/custom-provider.md`, legacy
provider-config form):

```ts
pi.registerProvider("lemonade", {
  name: "Lemonade",
  baseUrl: "http://localhost:13305/v1",
  apiKey: "lemonade",          // dummy; lemond needs no auth, pi needs a value
  api: "openai-completions",
  models: [...mapped models...],
});
```

Note: the owner's static provider `Lemonade` (capital L, in
`~/.pi/agent/models.json`) coexists during testing and will be removed by
the owner at cutover. Do not touch it.

## Steps

### Step 1 — Scaffold

Create:

- `package.json`: name `pi-lemonade`, version `0.1.0`, `"type": "module"`,
  keyword `pi-package`, `"pi": { "extensions": ["./src/index.ts"] }`
  (same shape as sibling `pi-tts`), scripts:
  - `"typecheck": "tsc --noEmit"`
  - `"test": "node --test test/"`
  - `"dry-run": "node src/dry-run.ts"`
  devDependencies: `"typescript": "^5"`.
  peerDependencies: `"@earendil-works/pi-coding-agent": "*"`.
- `tsconfig.json`: `strict: true`, `module: "nodenext"`,
  `moduleResolution: "nodenext"`, `target: "es2022"`, `noEmit: true`,
  `include: ["src", "test"]`.
- Run `npm install` (installs typescript only).

Acceptance: `npx tsc --noEmit` exits 0 (no source files yet is fine).

### Step 2 — `src/lemonade-api.ts`

Typed client for discovery. Contents:

- `export interface LemonadeModel { id: string; type: string; labels: string[]; downloaded: boolean; recipe: string; max_context_window?: number; }`
- `export async function fetchLemonadeModels(baseUrl: string): Promise<LemonadeModel[] | null>`
  - `GET {baseUrl}/api/v1/models` with a 5-second `AbortSignal.timeout`.
  - Return `null` (never throw) when: fetch rejects, status is not 2xx,
    `content-type` header does not contain `application/json`, or the body
    does not parse to an object with a `data` array.
  - Otherwise return `data` filtered to entries that have a string `id`.
- No other exports. No pi imports here (keep it testable standalone).

Acceptance: `npx tsc --noEmit` exits 0.

### Step 3 — `src/capabilities.ts`

Pure mapping functions (no I/O, no pi imports):

- `export function isChatModel(m: LemonadeModel): boolean` — implements the
  filter rule from the Facts table.
- `export function toPiModel(m: LemonadeModel): PiModelConfig` — implements
  the mapping table exactly. Define `PiModelConfig` as a local interface
  with the fields from the table (id, name, reasoning, input, contextWindow,
  maxTokens, cost, compat) — do not import pi types.

Acceptance: `npx tsc --noEmit` exits 0.

### Step 4 — `src/index.ts`

The extension entry:

```ts
export default async function (pi: { registerProvider: (name: string, cfg: unknown) => void }) { ... }
```

- Base URL: `process.env.LEMONADE_URL ?? "http://localhost:13305"`.
- Call `fetchLemonadeModels(baseUrl)`. If `null` or empty after filtering:
  `console.error("[pi-lemonade] lemonade server not reachable or no chat models at <url> — no models registered")`
  and return without registering.
- Else map with `isChatModel` + `toPiModel` and call `pi.registerProvider`
  exactly as shown in the Facts section (baseUrl for chat is
  `${baseUrl}/v1`).
- Use a loose parameter type as shown; do not add pi as a dependency.

Acceptance: `npx tsc --noEmit` exits 0.

### Step 5 — Tests: `test/capabilities.test.ts` and `test/lemonade-api.test.ts`

Use `node:test` + `node:assert/strict`.

`capabilities.test.ts` — table-driven over `isChatModel` and `toPiModel`:
- vision model (labels `["vision","tool-calling"]`, type llm, downloaded,
  `max_context_window: 262144`) → input includes image, contextWindow
  262144, maxTokens 32768, reasoning true, compat thinkingFormat
  `qwen-chat-template`.
- non-vision small model (`max_context_window: 40960`) → input text only,
  maxTokens 4096.
- missing `max_context_window` → contextWindow 32768, maxTokens 4096.
- `type: "embeddings"` → filtered out. `downloaded: false` → filtered out.
- labels missing `reasoning` → reasoning still true (blanket rule).

`lemonade-api.test.ts` — mock `globalThis.fetch` (save/restore in
`beforeEach`/`afterEach`):
- HTML 200 response (`content-type: text/html`) → `null` (the SPA trap).
- JSON 200 with `{data:[...]}` → returns array.
- network reject → `null`.
- JSON 200 with wrong shape (`{}`) → `null`.

Acceptance: `npm test` exits 0, all tests pass.

### Step 6 — `src/dry-run.ts`

A standalone script (run by `npm run dry-run`) that performs live discovery
against the real server and prints what *would* be registered, without pi:

- Fetch, filter, map (reuse the real functions).
- Print one line per registered model:
  `id | input=text[,image] | ctx=N | maxTokens=N` and a final count line,
  plus a line listing the excluded model ids with their `type`.
- If the server is unreachable, print the same warning message Step 4 uses
  and exit 0 (not an error).

Acceptance: `npm run dry-run` against the live server prints ~12 registered
models including `Qwen3.6-35B-A3B-MTP-Uncensored` (with `image`) and
excludes `embed-gemma-300m-FLM`, `whisper-v3-turbo-FLM`, `ThinkSound-SFX`.
Paste the full output in your report.

### Step 7 — Docs

- `README.md`: what it does (auto-discovers Lemonade chat models into pi),
  install line `pi install git:github.com/ekenberg/pi-lemonade@live`,
  the `LEMONADE_URL` env override, v1 scope + deferred items (one line each),
  and the cutover note (owner removes the static `Lemonade` block from
  `~/.pi/agent/models.json` after verifying).
- `DEV.md`: edit loop (edit → commit/push `live` → `pi update --extensions`
  → fresh pi session), how to run typecheck/test/dry-run, and the two
  carried-forward verifications from DISCOVERY.md §Decision (big-MoE
  `enable_thinking:false` cold-load test; FLM `chat_template_kwargs`
  tolerance) as open checkboxes.

Acceptance: files exist, claims match the code you actually wrote.

### Step 8 — Final validation (run everything)

1. `npx tsc --noEmit` → 0
2. `npm test` → 0
3. `npm run dry-run` → sane live output (paste it)
4. `git status` — confirm no files outside the repo were touched and none
   of the do-not-edit files changed.

Report: per-step results, dry-run output, any deviations from this plan
with justification, and anything you were unsure about.

## Reviewer notes

Review against this plan literally: mapping table values, filter rule, the
never-throw guarantee in the factory, the content-type guard, test coverage
of the SPA-trap case, and the hard-constraints list. Run `npm test`,
`npx tsc --noEmit`, and `npm run dry-run` yourself; do not trust the
worker's pasted output. Report findings with file/line references. Do not
edit files — findings only.
