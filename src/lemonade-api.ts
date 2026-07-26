export interface LemonadeModel {
  id: string;
  labels: string[];
  downloaded: boolean;
  recipe: string;
  max_context_window?: number;
}

/**
 * Fetch the model list from a Lemonade Server instance.
 *
 * Never throws: returns `null` on any failure (network error, non-2xx
 * status, non-JSON content-type, or unexpected body shape). Lemonade's
 * web-app SPA serves `text/html` with HTTP 200 on bare/unknown paths, so a
 * 200 status alone is not sufficient evidence of a valid API response.
 */
export async function fetchLemonadeModels(
  baseUrl: string,
): Promise<LemonadeModel[] | null> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/models`, {
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

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

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
