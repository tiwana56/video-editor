// ProCut — Cloudflare image proxy (cf-worker.js)
//
// DEPLOY (phone, dashboard):
//   1. dash.cloudflare.com → Workers & Pages → Create Worker → paste this whole file → Deploy.
//   2. Worker → Settings → Variables → Add variable (Type: Secret):
//        CF_API_TOKEN  = Workers AI API token (Workers AI page → Use REST API → Create token)
//        CF_ACCOUNT_ID = Account ID (same page)
//   3. Worker URL (https://<name>.<subdomain>.workers.dev) copy kar ke ProCut →
//      Scene Video → "Cloudflare Worker URLs" box mein paste karein (aik line per Worker).
//
// FLOW: ProCut calls GET ?prompt=...&refUrl=...&seed=... (simple request — NO CORS
//   preflight, is liye phone ke network par bhi chalta hai). POST JSON bhi chalta hai.
//   - refUrl ho to model = flux-2-klein-4b (reference image = image 0, 1280x720)
//   - refUrl na ho to model = flux-1-schnell (scenery, sasta — default size)
// Reply JSON: {ok:true, image:"<base64>", mime:"image/jpeg", model:"..."}
//   ya {ok:false, error:"..."} — ProCut error dikhata hai / agle Worker par jata hai.
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
    try {
      let prompt = "", refUrl = "", seed = null;
      if (request.method === "GET") {
        const u = new URL(request.url);
        prompt = u.searchParams.get("prompt") || "";
        refUrl = u.searchParams.get("refUrl") || "";
        const s = u.searchParams.get("seed");
        if (s != null) seed = parseInt(s);
        if (!prompt) return json({ ok: false, error: "POST only — ya GET ?prompt=... use karein" });
      } else if (request.method === "POST") {
        const body = await request.json();
        prompt = String(body.prompt || "");
        refUrl = body.refUrl || "";
        seed = body.seed != null ? parseInt(body.seed) : null;
      } else {
        return json({ ok: false, error: "POST only — ya GET ?prompt=... use karein" });
      }
      prompt = prompt.slice(0, 2000);
      if (!prompt) throw new Error("prompt missing");
      if (seed == null || isNaN(seed)) seed = Math.floor(Math.random() * 1000000);
      const hasRef = !!refUrl;
      const model = hasRef
        ? "@cf/black-forest-labs/flux-2-klein-4b"
        : "@cf/black-forest-labs/flux-1-schnell";
      const url =
        "https://api.cloudflare.com/client/v4/accounts/" +
        env.CF_ACCOUNT_ID +
        "/ai/run/" +
        model;
      let res;
      if (hasRef) {
        // klein-4b: multipart form, input images must be < 512x512 (portraits are 500px).
        const form = new FormData();
        let p = prompt;
        if (!/image 0|reference image/i.test(p))
          p +=
            " Use image 0 as the reference — the same person with the same face, same hairstyle and same features.";
        form.append("prompt", p);
        form.append("width", "1280");
        form.append("height", "720");
        form.append("seed", String(seed));
        const r = await fetch(refUrl, { cf: { cacheTtl: 3600 } });
        if (!r.ok) throw new Error("ref fetch failed: HTTP " + r.status);
        form.append("input_image_0", await r.blob(), "ref.jpg");
        res = await fetch(url, {
          method: "POST",
          headers: { Authorization: "Bearer " + env.CF_API_TOKEN },
          body: form,
        });
      } else {
        // schnell: JSON body — prompt ONLY (live test: API rejects seed/steps fields).
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.CF_API_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt }),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        const msg =
          (data.errors && data.errors[0] && data.errors[0].message) ||
          data.message ||
          "HTTP " + res.status;
        return json({ ok: false, error: String(msg).slice(0, 300) });
      }
      const b64 = data.result && data.result.image;
      if (!b64) throw new Error("no image in reply");
      return json({ ok: true, image: b64, mime: "image/jpeg", model });
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e).slice(0, 300) });
    }
  },
};
