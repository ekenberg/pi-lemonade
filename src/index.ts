import { fetchLemonadeModels } from "./lemonade-api.ts";
import { isChatModel, toPiModel } from "./capabilities.ts";
import { registerStatusCommand } from "./status-command.ts";

export default async function (pi: {
  registerProvider: (name: string, cfg: unknown) => void;
  registerCommand: (name: string, cfg: unknown) => void;
}) {
  const baseUrl = process.env.LEMONADE_URL ?? "http://localhost:13305";

  registerStatusCommand(pi, baseUrl);

  const models = await fetchLemonadeModels(baseUrl);
  const chatModels = (models ?? []).filter(isChatModel).map(toPiModel);

  if (chatModels.length === 0) {
    console.error(
      `[pi-lemonade] lemonade server not reachable or no chat models at ${baseUrl} — no models registered`,
    );
    return;
  }

  pi.registerProvider("lemonade", {
    name: "Lemonade",
    baseUrl: `${baseUrl}/v1`,
    apiKey: "lemonade",
    api: "openai-completions",
    models: chatModels,
  });
}
