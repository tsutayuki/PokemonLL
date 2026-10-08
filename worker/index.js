let memory = {};

async function readCounts(env) {
  if (env.POKEMON_PICKS) {
    const raw = await env.POKEMON_PICKS.get("counts");
    return raw ? JSON.parse(raw) : {};
  }
  return memory;
}

async function writeCounts(env, counts) {
  if (env.POKEMON_PICKS) {
    await env.POKEMON_PICKS.put("counts", JSON.stringify(counts));
    return;
  }
  memory = counts;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/pokemon-picks") {
      if (request.method === "GET") {
        return Response.json(await readCounts(env));
      }
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const id = String(body.id ?? "");
        if (!/^[\w:.-]+$/.test(id) || id.length > 96) {
          return new Response("bad id", { status: 400 });
        }
        const counts = await readCounts(env);
        counts[id] = (counts[id] || 0) + 1;
        await writeCounts(env, counts);
        return Response.json(counts);
      }
      return new Response("method", { status: 405 });
    }
    return env.ASSETS.fetch(request);
  },
};
