# DISCOVERY.md — pi-lemonade evaluation output

This file is the **output target** for the context-gathering / discovery
phase described in AGENTS.md. Fill it in as you verify and assess; do not
edit HANDOVER.md (it is the input/freeze of what was known at handover —
record corrections here in §Discrepancies, and update HANDOVER.md only if
the owner directs a re-freeze).

## Verified facts

Confirm (or correct) the claims in HANDOVER.md §9. One line each, dated.
Preface any that fail with `❌` and move the detail to §Discrepancies.

- [ ] `GET :13305/v1/models` → JSON, 4 model ids
- [ ] `GET :13305/api/v1/models` → richer objects (labels, max_context_window)
- [ ] `GET :13305/api/v1/health` → `{status:"ok",…}`
- [ ] `GET :13305/health` and `/props?autoload=false` → HTML + 200 (SPA trap)
- [ ] `POST :13305/v1/chat/completions` round-trips on Qwen3.6-35B
- [ ] `~/.pi/agent/models.json` has `Lemonade` provider, 4 models
- [ ] `~/.pi/agent/settings.json` has no `pi-llama-cpp`, has `Lemonade/*` enabled
- [ ] `~/.pi/agent/npm/node_modules/pi-llama-cpp/` still present as reference

Additional facts worth recording as you find them (endpoint behaviors, label
values actually returned, pi openai-completions parsing of `reasoning_content`,
etc.):

-

## Discrepancies / gaps in HANDOVER.md

Where HANDOVER.md was wrong, incomplete, or has drifted since handover. Cite
the section and give the corrected fact with evidence.

-

## Open questions

Things that need an answer (from the owner, from pi docs, or from
experiment) before the assessment can be final.

-

## Assessment

Address the honest gate from HANDOVER.md §2 explicitly:

- How often does the lemond model set actually change? (Stable at 3–4, or
  churny?)
- Is pre-loading via `lemonade load` in a terminal acceptable, or is
  in-pi load/control wanted?
- Does pi's `openai-completions` already parse `reasoning_content`, or is
  the thinking knob currently a no-op on these models?
- Is the status/telemetry surface (loaded model, device, VRAM) something
  the owner actually looks at inside pi, or is `lemonade status` enough?

## Recommendation

One of:
- **Defer** — static provider is sufficient for now; revisit when <trigger>.
- **Build** — proceed to implementation with the scope below.

Rationale:

## If build: proposed scope & plan

(Only if recommendation is Build. Otherwise leave empty.)

- Core:
- Lemond-specific:
- Deferred:
- File layout:
- Test approach:
- Upstream path (personal fork first vs upstream directly):

## Decision

Owner's call, recorded here with date:
