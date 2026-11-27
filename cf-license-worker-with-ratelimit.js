// ProCut — licence key check Worker WITH per-IP rate limit (DEPLOY-READY — Phase 2 #5)
//
// *** DEPLOY-READY — KV binding PROCUT_RATELIMIT deploy ke waqt lagani hai (neeche steps). ***
// Current Worker (cf-license-worker.js, Build 142 live) se farq — SIRF ye
// cheezein badli hain, baqi sab waisa hi hai:
//   1. Har POST se pehle per-IP rate-limit check (KV counter, 1-hour window).
//   2. Limit cross ho to reply {ok:false, error:"rate limited"} (HTTP 429),
//      KV read hoti hi nahi — key check bhi nahi hota.
//   3. GET health check (/GET → {ok:true, service:"procut-license"}) par
//      rate limit NAHI lagta.
//   4. Naya KV binding: PROCUT_RATELIMIT (neeche deploy steps dekhein).
//
// LIMIT CHOSEN — 20 POSTs per IP per hour (documented choice):
//   Asal istemal: licence check sirf unlock ke waqt + 30-day offline grace
//   ke baad — aik phone mahine mein 1-2 dafa check karta hai. 20/hour/IP
//   is se 100x zyada hai, to Saif/Faizan kabhi is se nahi takrayein ge.
//   Keys lambe random strings hain, brute force waise hi infeasible hai —
//   ye limit sirf Worker ko hammer hone (DoS, 100k req/day cap khane) se
//   rokti hai. Limit cross hone par sirf us IP ki requests 1 ghante ke
//   liye rukti hain; licence keys ya KV data ko kuch nahi hota.
//
// HONEST NOTE — KV eventually consistent hai: counter thora approximate
//   hai (kuch requests zyada guzar sakti hain). Casual hammer rokne ke
//   liye kaafi hai; bank-grade limiter nahi. Cloudflare ka built-in Rate
//   Limiting (WAF) Free plan par per-IP rule ke liye paid add-on hai —
//   is liye $0 KV wala tareeqa chuna gaya.
//
// FAIL-OPEN CHOICE (jaan-boojh kar): agar PROCUT_RATELIMIT binding missing
//   ho to Worker rate limit SKIP karke licence check jaari rakhta hai —
//   taake aik chhooti hui binding Saif ko app se lock na kar de. Limit ka
//   na hona aik security gap hai, lockout nahi. Deploy ke waqt binding
//   lagana phir bhi lazmi hai (neeche step 3).
//
// DEPLOY (phone, dashboard) — Phase 2 build mein hoga:
//   1. dash.cloudflare.com → Workers & Pages → Worker "procut-license"
//      (orange-disk-ff22.saiftiwana56.workers.dev) → Edit code → ye POORI
//      file paste karein → Deploy.
//   2. Workers & Pages → KV → Create namespace "procut-ratelimit".
//   3. Worker → Settings → Variables → KV Namespace Bindings → Add binding:
//        Variable name: PROCUT_RATELIMIT → namespace "procut-ratelimit"
//        → Deploy. (PROCUT_LICENSES wali purani binding chherni nahi.)
//   4. Test: app mein licence unlock karein (PASS hona chahiye). Phir
//      20+ ghalat keys aik minute mein try karein — 21st par "rate
//      limited" aana chahiye; 1 ghante baad khud theek ho jaye ga.
//      (Ghalat-key test sirf Muse ke kehne par karein — apni asal key
//      se zyada try na karein.)
//
// FLOW: ProCut POST {key} → Worker pehle rate limit, phir KV mein key.
//   Reply: {ok:true, validUntil:<now + 30 days>}  ya  {ok:false}
//   Key yahan kabhi log nahi hoti, aur reply mein wapas nahi bheji jati.
export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (obj, status) =>
      new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method === "GET") {
      return json({ ok: true, service: "procut-license", hint: "POST {key}" });
    }
    if (request.method !== "POST") return json({ ok: false, error: "POST only" });
    try {
      // --- Rate limit (NEW — audit #5): 20 POSTs / IP / hour ---
      const LIMIT_PER_HOUR = 20;
      const WINDOW_SECONDS = 3600;
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const hourBucket = Math.floor(Date.now() / 3600000);
      const rlKey = "rl:" + ip + ":" + hourBucket;
      const rlNs = env.PROCUT_RATELIMIT;
      if (rlNs) {
        const prev = await rlNs.get(rlKey);
        const count = prev ? parseInt(prev, 10) || 0 : 0;
        if (count >= LIMIT_PER_HOUR) {
          return json({ ok: false, error: "rate limited" }, 429);
        }
        // Counter barhayein; 1 ghante baad khud expire ho jaye ga.
        ctx.waitUntil(rlNs.put(rlKey, String(count + 1), { expirationTtl: WINDOW_SECONDS }));
      }
      // (PROCUT_RATELIMIT binding missing ho to limit skip — fail-open,
      //  taake licence check kabhi is wajah se na ruke. Deploy step 3 dekhein.)
      // --- rate limit khatam — neeche sab current Worker jaisa hai ---

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
