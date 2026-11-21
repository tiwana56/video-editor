# Video Editor — Deploy Guide (Roman Urdu)

Ye aap ka personal video editor hai — mobile browser mein chalta hai.
Muft hai, koi watermark nahi.

## Deploy karne ke steps (phone se)

1. **GitHub account** banao: github.com par Sign up karo (naya account).
2. **New repository** banao: naam `video-editor`, Public rakho, Create.
3. **File upload karo**: repo mein "Add file" -> "Upload files" -> is ZIP ko
   unzip kar ke `index.html` upload karo -> "Commit changes" dabao.
4. **Vercel account** banao: vercel.com par "Continue with GitHub" se
   GitHub connect karo.
5. **Project import karo**: Vercel dashboard -> "Add New..." -> "Project" ->
   `video-editor` repo select karo -> "Deploy" dabao.
6. **URL mil jayega**, jaise: https://video-editor-xxxx.vercel.app
   Usay phone ke browser mein kholo, home screen par add kar lo.

## Update kaise karein

Jab editor ka naya version mile to nayi `index.html` ko repo mein dobara
upload karo (purani file replace ho jayegi) — Vercel khud redeploy kar dega,
URL wohi rahega.

## Features

- Trim, multi-clip join, Urdu title/subtitle (Nastaliq), Bismillah overlay
- Filters, speed, rotate/flip/zoom, 9:16 / 16:9 / 1:1, 480p/720p export
- Thumbnail Studio (Gemini AI ya video frame se, 1280x720 JPG)
- Audio alag karna (WAV download)
- Gemini se Urdu title / description / tags (apni muft API key page par dalni hai)
