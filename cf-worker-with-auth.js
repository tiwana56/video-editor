// ProCut — Cloudflare image proxy WITH shared-secret auth (DEPLOY-READY — Phase 2 #5)
//
// *** DEPLOY-READY — EXPECTED_AUTH app ke CF_WORKER_AUTH (Build 145+) se match karta hai, verify ho gaya. ***
// Current Worker (cf-worker.js, Build 143 jaisa) se farq — SIRF ye 3 cheezein
// badli hain, baqi sab byte-jaisa waisa hi hai:
//   1. Upar EXPECTED_AUTH constant add hua (placeholder — neeche dekhein).
//   2. Har request se pehle auth check: POST mein JSON body field `auth`,
//      GET mein query param `?auth=` — ghalat/missing ho to 401, AI call
//      hoti hi nahi (neuron spend zero).
//   3. 401 reply: {ok:false, error:"unauthorized"} — app is ko "Worker key
//      ghalat hai" ke tor par dikhaye ga (Phase 2 app side).
//
// ⚠️⚠️⚠️ DEPLOY SE PEHLE LAZMI — PLACEHOLDER BADALNA HAI ⚠️⚠️⚠️
//   Neeche wali line mein "pc1-6a3e6ec74ab1edd5381877677106d1e0" ki jagah ASAL
//   secret likhna hai. Wo asal secret app ke constant `CF_WORKER_AUTH` ke
//   BARABAR hona chahiye (Phase 1, item F — Build 145 mein app mein aaye ga).
//   Placeholder wali file deploy ki to IMAGE GENERATION DONO PHONES PAR
//   BAND HO JAYE GI (har request 401). Is liye deploy se pehle Muse se
//   reconcile karwayein: app constant == is file ki value.
//   Secret ki value kabhi chat / repo / screenshot mein nahi aani chahiye —
//   Saif khud dashboard mein paste karein ge, ya Muse ko secure tareeqe se
//   dein ge. (Behtar tareeqa — Phase 2 mein Workers Secret variable mein
//   rakhna — is draft mein task ke mutabiq code mein placeholder hai.)
//
// DEPLOY (phone, dashboard) — Phase 2 build mein hoga:
//   1. dash.cloudflare.com → Workers & Pages → Worker "procut-cf-images"
//      (ToolNest account, saiftiwana56) → Edit code → ye POORI file paste
//      karein → Deploy.
//   2. DOOSRA image Worker (roznamaads account) par BHI yehi file, USI
//      secret value ke sath paste karein → Deploy. Dono Workers par aik hi
//      secret hona lazmi hai, warna aik account ka Worker 401 de ga.
//   3. Deploy ke baad app se aik test image banayein — dono Workers se.
//      401 aaye to secret match nahi — app constant aur Worker value
//      dobara compare karein, dobara paste karein.
//
// FLOW (baqi sab current Worker jaisa): ProCut POST {prompt, refUrl, seed, auth}
//   ya GET ?prompt=...&refUrl=...&seed=...&auth=...
//   - refUrl ho to model = flux-2-klein-4b (reference image = image 0, 1280x720)
//   - refUrl na ho to model = flux-1-schnell (scenery, sasta — default size)
// Reply JSON: {ok:true, image:"<base64>", mime:"image/jpeg", model:"..."}
//   ya {ok:false, error:"..."} — ProCut error dikhata hai / agle Worker par jata hai.
//
// NOTE — GET ?auth= ke baare mein: secret URL mein aata hai, jo logs mein
//   aa sakta hai. Ye sirf is liye rakha hai ke app ka current GET rasta
//   (no-preflight) chal sake. Phase 2 mein app ko POST-only karna behtar
//   hai — phir is file se GET branch hata di jaye gi. Agar Phase 1 item F
//   app ko pehle hi POST-only kar de to deploy ke waqt GET branch hata dein.
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

    // --- Shared-secret check (NEW — audit #5) ---
    // MUST equal the app's CF_WORKER_AUTH constant (Phase 1, Build 145).
    // ⚠️ Deploy se pehle is placeholder ko asal secret se badlein.
    const EXPECTED_AUTH = "pc1-6a3e6ec74ab1edd5381877677106d1e0";
    let providedAuth = "";
    let body = null;
    try {
      if (request.method === "GET") {
        providedAuth = new URL(request.url).searchParams.get("auth") || "";
      } else if (request.method === "POST") {
        body = await request.json();
        providedAuth = String((body && body.auth) || "");
      }
    } catch (e) {
      return json({ ok: false, error: "bad request" });
    }
    if (providedAuth !== EXPECTED_AUTH) {
      return json({ ok: false, error: "unauthorized" });
    }
    // --- auth check khatam — neeche sab current Worker jaisa hai ---

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
