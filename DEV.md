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

- [ ] Cold-load test: `enable_thinking:false` (via `qwen-chat-template` /
      `chat_template_kwargs`) on a big MoE model that uses
      `--reasoning-preserve` (e.g. `Gemma4-26B-A4B-QAT-MTP-Uncensored` or
      `Qwen3.6-35B-A3B-MTP-Uncensored`) — confirm the thinking toggle still
      works correctly on first load, not just after a warm reload.
- [ ] FLM backend tolerance: confirm the FLM recipe accepts
      `chat_template_kwargs` (sent by `qwen-chat-template` thinking format)
      without erroring, for at least one `-FLM` model (e.g.
      `qwen3.5-4b-FLM`).

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
