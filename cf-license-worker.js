// ProCut — licence key check Worker (cf-license-worker.js)
//
// DEPLOY (phone, dashboard):
//   1. dash.cloudflare.com → Workers & Pages → Create Worker (name: procut-license)
//      → paste this whole file → Deploy.
//   2. Workers & Pages → KV → Create namespace "procut-licenses".
//   3. Worker → Settings → Variables → KV Namespace Bindings → Add binding:
//        Variable name: PROCUT_LICENSES → select namespace "procut-licenses" → Deploy.
//   4. KV → namespace "procut-licenses" → Add entry (2 entries — aik per user):
//        Key   = the licence string itself, e.g. procut-a1b2c3d4e5f6g7h8i9j0k1l2
//                (long random — Saif khud banayein, kabhi chat mein na bhejein)
//        Value = {"label":"saif"}   (doosri entry: {"label":"beta"})
//      Revoke: entry delete kar dein, ya value mein "revoked":true kar dein.
//   5. Worker URL (https://procut-license.<subdomain>.workers.dev) ki sirf URL
//      Muse ko dein — keys kabhi chat mein nahi aati.
//
// FLOW: ProCut POST {key} → Worker KV mein key dhoondta hai.
//   Reply: {ok:true, validUntil:<now + 30 days>}  ya  {ok:false}
//   Key yahan kabhi log nahi hoti, aur reply mein wapas nahi bheji jati.
export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (obj) =>
      new Response(JSON.stringify(obj), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method === "GET") {
      return json({ ok: true, service: "procut-license", hint: "POST {key}" });
    }
    if (request.method !== "POST") return json({ ok: false, error: "POST only" });
    try {
      const body = await request.json();
      const key = String((body && body.key) || "").trim();
      if (!key) return json({ ok: false });
      const ns = env.PROCUT_LICENSES;
      if (!ns) return json({ ok: false, error: "KV binding PROCUT_LICENSES missing" });
      const raw = await ns.get(key);
      if (!raw) return json({ ok: false });
      let val = null;
      try { val = JSON.parse(raw); } catch (e) { val = null; }
      if (val && val.revoked) return json({ ok: false });
      return json({ ok: true, validUntil: Date.now() + 30 * 24 * 3600 * 1000 });
    } catch (e) {
      return json({ ok: false, error: "bad request" });
    }
  },
};
