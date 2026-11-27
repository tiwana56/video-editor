# ProCut Studio — Video Editor

Video editor — web app + Android APK. Source of truth is the repo-root
`index.html` (plus `sw.js`, `manifest.json`, icons).

## Site aur APK

- **Site:** https://tiwana56.github.io/video-editor/
- **APK (latest):** https://github.com/tiwana56/video-editor/releases/download/latest/ProCut-Studio-debug.apk
  - Phone par install karne ke liye browser ko "Install unknown apps" allow karein.

## Build kaise hota hai

- `main` par push hote hi GitHub Actions (`build-android.yml`) debug APK
  banata hai aur rolling `latest` release par publish karta hai.
- Har build mein root files ko `www/` mein copy karke `npx cap sync android`
  chalaya jata hai — is liye `www/` aur
  `android/app/src/main/assets/public/` repo mein committed nahi hote;
  ye build artifacts hain, haath se edit na karein.
- `versionCode` GitHub run number se aur `versionName` `index.html` ke
  `appVer` (jaise `26-Nov-148`) se aata hai.
- GitHub Pages site ko `main` se serve karta hai; CI Gate har push par
  `index.html` ke inline scripts check karta hai.

## OTA, licence, Library

- **OTA:** OtaKit — `OTAKIT_TOKEN` repo secret lagne par build ke sath OTA
  bundle upload hota hai (secret na ho to step skip ho jata hai).
- **Licence lock:** Cloudflare Worker (`cf-license-worker.js`) + KV —
  key ek dafa per phone, phir 30 din offline.
- **Library / character refs:** Supabase bucket `procut-refs` — portrait
  pehle Library mein naam se upload karein, script mein wahi naam likhein.
- **Images:** Cloudflare Workers AI main route (`cf-worker.js`),
  Pollinations backup.

## Repo

- https://github.com/tiwana56/video-editor
