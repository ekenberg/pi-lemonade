# pi-lemonade

A [pi](https://github.com/earendil-works/pi-mono) extension that auto-discovers
chat-capable models from a local [Lemonade Server](https://lemonade-server.ai/)
(`lemond`) instance and registers them as a pi model provider — no manual
`models.json` maintenance required.

## What it does

On startup, the extension:

1. Queries `GET /api/v1/models` on the configured Lemonade Server.
2. Filters the result to downloaded, chat-capable LLMs (excludes
   embeddings, transcription, and audio-generation models — see
   `DISCOVERY.md` for the exact filter rule).
3. Maps each remaining model to a pi model config (vision-aware `input`,
   context window, max output tokens, and `qwen-chat-template` thinking
   support) and registers them all under a provider named `lemonade`.

If the server is unreachable, returns no usable models, or responds with
anything other than JSON (Lemonade's web UI serves an HTML catch-all on
unknown paths), the extension logs one warning and registers nothing — it
never throws or blocks pi startup.

## Install

```
pi install git:github.com/ekenberg/pi-lemonade@live
```

## Configuration

By default the extension talks to `http://localhost:13305`. Override with:

```
LEMONADE_URL=http://other-host:13305
```

## v1 scope

- Auto-discovery + capability inference + provider registration only.
- Every registered model is marked `reasoning: true` (blanket decision —
  see `DISCOVERY.md` §Decision) with `compat.thinkingFormat:
  "qwen-chat-template"`.

Deferred to a later version (see `DISCOVERY.md` §Decision):

- Explicit load/unload commands.
- Device (NPU/GPU) badges.
- Eviction-aware UX.

## Commands

### `/lemonade-status`

A read-only overlay showing everything lemond reports about itself:

- **Loaded model(s)** — name, device (`gpu`/`npu`), type, backend status,
  context window, pinned state, backend pid and url, checkpoint. When nothing
  is resident (lemond idle-evicts) it says so explicitly.
- **Residency** — per-capability caps (`llm 1/1`, `embedding 0/1`, …) and
  pinned counts.
- **Last call** — server-measured TTFT and tokens/sec, plus input/output
  tokens. These are lemond's own numbers, so unlike a client-side meter they
  include server-side queueing and true time-to-first-token.
- **Totals** — cumulative request count and token counts.
- **System** — CPU / GPU / NPU gauges, RAM and VRAM.

The view auto-refreshes every second (the three endpoints it reads are
lemond-designated "quiet polling" paths, so this is cheap and intended).
Press `r` to refresh immediately, `esc` to close. It never mutates server
state, and it degrades gracefully: if lemond is unreachable it says so rather
than showing stale numbers, and any individual endpoint that fails renders as
`—` placeholders instead of dropping its section.

RAM and VRAM are shown as plain numbers rather than bars on purpose: lemond
reports usage but no total, and inventing a denominator would make the bar
lie.

## Cutover note

The hand-maintained static `Lemonade` provider block was removed from
`~/.pi/agent/models.json` on 2026-07-26 once this extension was verified.
Keeping both caused a subtle trap: the two providers differed only by
capitalisation in `/model`, and picking the static one silently disabled the
thinking toggle.
