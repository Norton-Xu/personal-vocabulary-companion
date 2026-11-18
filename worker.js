const ALLOWED_ORIGINS = new Set([
  "https://norton-xu.github.io",
  "http://localhost:8787",
]);
const CACHE_SECONDS = 60 * 60 * 24 * 90;

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://norton-xu.github.io",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cleanText(value = "") {
  return value
    .replace(/\{[^}]+\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findExample(value) {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    if (value[0] === "vis" && Array.isArray(value[1])) {
      const illustration = value[1].find((item) => typeof item?.t === "string");
      if (illustration) return cleanText(illustration.t);
    }
    for (const item of value) {
      const example = findExample(item);
      if (example) return example;
    }
    return "";
  }
  if (Array.isArray(value.vis) && value.vis[0]?.t) return cleanText(value.vis[0].t);
  for (const nestedValue of Object.values(value)) {
    const example = findExample(nestedValue);
    if (example) return example;
  }
  return "";
}

function normalizeForm(value) {
  return String(value || "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function collectForms(entry) {
  const forms = new Set([
    entry.meta?.id?.split(":")[0],
    ...(entry.meta?.stems || []),
    ...(entry.ins || []).map((item) => item.if),
  ].map(normalizeForm).filter(Boolean));
  return [...forms];
}

function normalizeEntry(entry) {
  const phonetic = entry.hwi?.prs?.find((item) => item.ipa)?.ipa || "";
  const definition = cleanText(entry.shortdef?.[0] || entry.meta?.["app-shortdef"]?.def?.[0] || "");
  if (!definition) return null;
  return {
    word: entry.meta?.id?.split(":")[0] || "",
    partOfSpeech: entry.fl || "",
    phonetic: phonetic ? `/${phonetic}/` : "",
    definition,
    example: findExample(entry.def),
    forms: collectForms(entry),
    source: "Merriam-Webster Learner's Dictionary",
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    if (request.method !== "GET" || !["/lookup", "/v3/lookup", "/v4/lookup"].includes(url.pathname)) {
      return jsonResponse(request, { error: "Not found" }, 404);
    }

    const word = (url.searchParams.get("word") || "").trim().toLowerCase();
    if (!/^[a-z][a-z -]{0,79}$/i.test(word)) return jsonResponse(request, { error: "Enter one English word or phrase." }, 400);
    if (!env.MW_LEARNERS_API_KEY) return jsonResponse(request, { error: "Dictionary service is not configured." }, 503);

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/cache/v4/${encodeURIComponent(word)}`);
    const cached = await cache.match(cacheKey);
    if (cached) return jsonResponse(request, await cached.json());

    const endpoint = `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(word)}?key=${encodeURIComponent(env.MW_LEARNERS_API_KEY)}`;
    try {
      const upstream = await fetch(endpoint);
      if (!upstream.ok) return jsonResponse(request, { error: "Dictionary service is unavailable." }, 502);
      const entries = await upstream.json();
      const entry = entries.find((item) => typeof item === "object");
      const result = normalizeEntry(entry);
      if (!result) return jsonResponse(request, { error: "No learner dictionary entry was found for that word." }, 404);

      const cacheResponse = new Response(JSON.stringify(result), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
        },
      });
      ctx.waitUntil(cache.put(cacheKey, cacheResponse));
      return jsonResponse(request, result);
    } catch {
      return jsonResponse(request, { error: "Could not reach the dictionary service." }, 502);
    }
  },
};
