export interface LemonadeModel {
  id: string;
  labels: string[];
  downloaded: boolean;
  recipe: string;
  max_context_window?: number;
}

export interface LemonadeLoadedModel {
  model_name: string;
  device?: string;
  type?: string;
  status?: string;
  backend_url?: string;
  checkpoint?: string;
  max_context_window?: number;
  pid?: number;
  pinned?: boolean;
}

export interface LemonadeHealth {
  status?: string;
  version?: string;
  model_loaded?: string | null;
  all_models_loaded: LemonadeLoadedModel[];
  max_models?: Record<string, number>;
  pinned_models?: Record<string, number>;
}

export interface LemonadeStats {
  time_to_first_token?: number;
  tokens_per_second?: number;
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_total?: number;
  output_tokens_total?: number;
  request_count_total?: number;
}

export interface LemonadeSystemStats {
  cpu_percent?: number;
  gpu_percent?: number;
  npu_percent?: number;
  memory_gb?: number;
  vram_gb?: number;
}

/**
 * Fetch and parse JSON from a Lemonade Server `/api/` path.
 *
 * Never throws: returns `null` on any failure (network error, non-2xx
 * status, non-JSON content-type, or unparsable body). Lemonade's web-app
 * SPA serves `text/html` with HTTP 200 on bare/unknown paths, so a 200
 * status alone is not sufficient evidence of a valid API response.
 */
async function fetchJson(baseUrl: string, path: string): Promise<unknown | null> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch the model list from a Lemonade Server instance.
 *
 * Never throws: returns `null` on any failure — see `fetchJson`.
 */
export async function fetchLemonadeModels(
  baseUrl: string,
): Promise<LemonadeModel[] | null> {
  const body = await fetchJson(baseUrl, "/api/v1/models");

  if (
    typeof body !== "object" ||
    body === null ||
    !("data" in body) ||
    !Array.isArray((body as { data: unknown }).data)
  ) {
    return null;
  }

  const data = (body as { data: unknown[] }).data;
  return data.filter((entry): entry is LemonadeModel => {
    if (typeof entry !== "object" || entry === null) {
      return false;
    }
    const candidate = entry as {
      id?: unknown;
      labels?: unknown;
      downloaded?: unknown;
      recipe?: unknown;
    };
    return (
      typeof candidate.id === "string" &&
      Array.isArray(candidate.labels) &&
      typeof candidate.downloaded === "boolean" &&
      typeof candidate.recipe === "string"
    );
  });
}

/**
 * Fetch server health / residency info from a Lemonade Server instance.
 *
 * Never throws: returns `null` on any failure — see `fetchJson`. Coerces a
 * missing or non-array `all_models_loaded` to `[]`, and drops non-object
 * entries within it, so callers never have to null-check it. Without the
 * element filter a single `null` entry would blow up rendering downstream.
 */
export async function fetchHealth(
  baseUrl: string,
): Promise<LemonadeHealth | null> {
  const body = await fetchJson(baseUrl, "/api/v1/health");

  if (typeof body !== "object" || body === null) {
    return null;
  }

  const candidate = body as Partial<LemonadeHealth>;
  return {
    ...candidate,
    all_models_loaded: Array.isArray(candidate.all_models_loaded)
      ? (candidate.all_models_loaded.filter(
          (entry) => entry !== null && typeof entry === "object",
        ) as LemonadeLoadedModel[])
      : [],
  };
}

/**
 * Fetch last-call telemetry from a Lemonade Server instance.
 *
 * Never throws: returns `null` on any failure — see `fetchJson`.
 */
export async function fetchStats(
  baseUrl: string,
): Promise<LemonadeStats | null> {
  const body = await fetchJson(baseUrl, "/api/v1/stats");

  if (typeof body !== "object" || body === null) {
    return null;
  }

  return body as LemonadeStats;
}

/**
 * Fetch host resource usage from a Lemonade Server instance.
 *
 * Never throws: returns `null` on any failure — see `fetchJson`.
 */
export async function fetchSystemStats(
  baseUrl: string,
): Promise<LemonadeSystemStats | null> {
  const body = await fetchJson(baseUrl, "/api/v1/system-stats");

  if (typeof body !== "object" || body === null) {
    return null;
  }

  return body as LemonadeSystemStats;
}
