// `/lemonade-status` overlay: a read-only, auto-refreshing view of Lemonade
// Server residency, last-call telemetry, and system stats.

import { fetchHealth, fetchStats, fetchSystemStats } from "./lemonade-api.ts";
import { renderStatus, type StatusSnapshot, type StatusTheme } from "./status-format.ts";

const REFRESH_MS = 1000;

interface TuiLike {
  requestRender(): void;
}

interface StatusComponent {
  render(width: number): string[];
  invalidate(): void;
  handleInput(data: string): void;
  dispose(): void;
}

function createStatusComponent(
  tui: TuiLike,
  theme: StatusTheme,
  baseUrl: string,
  done: (result: void) => void,
): StatusComponent {
  let snapshot: StatusSnapshot = {
    baseUrl,
    health: null,
    stats: null,
    system: null,
  };
  let closed = false;
  let inFlight = false;
  let interval: ReturnType<typeof setInterval> | undefined;

  const refresh = () => {
    if (closed || inFlight) return;
    inFlight = true;
    Promise.all([
      fetchHealth(baseUrl),
      fetchStats(baseUrl),
      fetchSystemStats(baseUrl),
    ])
      .then(([health, stats, system]) => {
        if (closed) return;
        snapshot = { baseUrl, health, stats, system };
        tui.requestRender();
      })
      .catch(() => {
        // never-throw contract: swallow, keep the last good snapshot
      })
      .finally(() => {
        inFlight = false;
      });
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (interval !== undefined) {
      clearInterval(interval);
      interval = undefined;
    }
  };

  refresh();
  interval = setInterval(refresh, REFRESH_MS);

  return {
    render(width: number): string[] {
      try {
        return renderStatus(snapshot, width, theme);
      } catch {
        return [];
      }
    },
    invalidate(): void {},
    handleInput(data: string): void {
      if (data === "\x1b" || data === "\u001b") {
        close();
        done(undefined);
        return;
      }
      if (data === "r" || data === "R") {
        refresh();
        return;
      }
      // everything else ignored
    },
    dispose(): void {
      close();
    },
  };
}

export function registerStatusCommand(
  pi: {
    registerCommand: (name: string, cfg: unknown) => void;
  },
  baseUrl: string,
): void {
  pi.registerCommand("lemonade-status", {
    description: "Show Lemonade Server status (loaded model, telemetry, system)",
    handler: async (
      _args: string,
      ctx: {
        ui: {
          custom<T>(
            factory: (
              tui: TuiLike,
              theme: StatusTheme,
              keybindings: unknown,
              done: (result: T) => void,
            ) => unknown,
            options?: unknown,
          ): Promise<T>;
        };
      },
    ) => {
      await ctx.ui.custom<void>(
        (tui, theme, _kb, done) => createStatusComponent(tui, theme, baseUrl, done),
        { overlay: true, overlayOptions: { width: 58, anchor: "center" } },
      );
    },
  });
}
