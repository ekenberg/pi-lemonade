#!/usr/bin/env node
// Standalone discovery dry-run: fetches, filters, and maps live Lemonade
// models exactly as src/index.ts would, and prints what would be
// registered, without touching pi at all.

import { fetchLemonadeModels } from "./lemonade-api.ts";
import { isChatModel, toPiModel } from "./capabilities.ts";
import type { LemonadeModel } from "./lemonade-api.ts";

async function main() {
  const baseUrl = process.env.LEMONADE_URL ?? "http://localhost:13305";

  const models = await fetchLemonadeModels(baseUrl);
  if (models === null) {
    console.error(
      `[pi-lemonade] lemonade server not reachable or no chat models at ${baseUrl} — no models registered`,
    );
    return;
  }

  const kept: LemonadeModel[] = [];
  const excluded: LemonadeModel[] = [];
  for (const m of models) {
    (isChatModel(m) ? kept : excluded).push(m);
  }

  if (kept.length === 0) {
    console.error(
      `[pi-lemonade] lemonade server not reachable or no chat models at ${baseUrl} — no models registered`,
    );
    return;
  }

  for (const m of kept) {
    const mapped = toPiModel(m);
    console.log(
      `${mapped.id} | input=${mapped.input.join(",")} | ctx=${mapped.contextWindow} | maxTokens=${mapped.maxTokens}`,
    );
  }
  console.log(`\n${kept.length} models registered`);

  const excludedList = excluded
    .map((m) => `${m.id} (recipe=${m.recipe})`)
    .join(", ");
  console.log(`excluded: ${excludedList || "(none)"}`);
}

main();
