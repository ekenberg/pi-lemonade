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
- Telemetry / status surface.
- Device (NPU/GPU) badges.
- Eviction-aware UX.

## Cutover note

This extension coexists with the hand-maintained static `Lemonade` provider
block in `~/.pi/agent/models.json` during testing. Once the extension is
verified to register the expected models, the owner will remove that static
block to avoid duplicate provider entries.
