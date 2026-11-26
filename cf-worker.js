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
// FLOW: ProCut POSTs JSON {prompt, refUrl?, seed?}
//   - refUrl ho to model = flux-2-klein-4b (reference image = image 0, 1280x720)
//   - refUrl na ho to model = flux-1-schnell (scenery, sasta — default size)
// Reply JSON: {ok:true, image:"<base64>", mime:"image/jpeg", model:"..."}
//   ya {ok:false, error:"..."} — ProCut error dikhata hai / agle Worker par jata hai.
export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (obj) =>
      new Response(JSON.stringify(obj), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ ok: false, error: "POST only" });
    try {
      const body = await request.json();
      const prompt = String(body.prompt || "").slice(0, 2000);
      if (!prompt) throw new Error("prompt missing");
      const seed =
        body.seed != null ? parseInt(body.seed) : Math.floor(Math.random() * 1000000);
      const hasRef = !!body.refUrl;
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
        const r = await fetch(body.refUrl, { cf: { cacheTtl: 3600 } });
        if (!r.ok) throw new Error("ref fetch failed: HTTP " + r.status);
        form.append("input_image_0", await r.blob(), "ref.jpg");
        res = await fetch(url, {
          method: "POST",
          headers: { Authorization: "Bearer " + env.CF_API_TOKEN },
          body: form,
        });
      } else {
        // schnell: JSON body, documented fields only (prompt + seed).
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.CF_API_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt, seed }),
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
