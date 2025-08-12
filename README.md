YorN Alpha — Mobile Diagnostics (CDN Fallback)
----------------------------------------------
Fixes 404 on TinyFaceDetector weights by auto-selecting a working CDN:
- Primary: jsDelivr (npm) → https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights
- Fallback: jsDelivr (GitHub) → https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights

Deploy:
  1) Upload to GitHub (index.html + vercel.json + README.md)
  2) Vercel → Import → Framework: Other → Build: (empty) → Output: .
