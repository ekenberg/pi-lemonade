import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchLemonadeModels } from "../src/lemonade-api.ts";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // no-op; each test installs its own mock
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

test("fetchLemonadeModels: HTML 200 response (SPA trap) returns null", async () => {
  globalThis.fetch = (async () =>
    new Response("<html>not the api</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  const result = await fetchLemonadeModels("http://localhost:13305");
  assert.equal(result, null);
});

test("fetchLemonadeModels: JSON 200 with {data:[...]} returns the array", async () => {
  const data = [
    { id: "m1", labels: [], downloaded: true, recipe: "llamacpp" },
  ];
  globalThis.fetch = (async () => jsonResponse({ data })) as typeof fetch;

  const result = await fetchLemonadeModels("http://localhost:13305");
  assert.deepEqual(result, data);
});

test("fetchLemonadeModels: network reject returns null", async () => {
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  const result = await fetchLemonadeModels("http://localhost:13305");
  assert.equal(result, null);
});

test("fetchLemonadeModels: JSON 200 with wrong shape ({}) returns null", async () => {
  globalThis.fetch = (async () => jsonResponse({})) as typeof fetch;

  const result = await fetchLemonadeModels("http://localhost:13305");
  assert.equal(result, null);
});

test("fetchLemonadeModels: drops malformed entries missing labels, keeps well-formed ones", async () => {
  const wellFormed = {
    id: "m1",
    labels: [],
    downloaded: true,
    recipe: "llamacpp",
  };
  const malformed = { id: "m1", downloaded: true, recipe: "llamacpp" };
  globalThis.fetch = (async () =>
    jsonResponse({ data: [wellFormed, malformed] })) as typeof fetch;

  const result = await fetchLemonadeModels("http://localhost:13305");
  assert.deepEqual(result, [wellFormed]);
});
