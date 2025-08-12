YorN Alpha — Mobile Multi‑CDN Build
-----------------------------------
What’s new:
- Multi‑CDN weights loader (jsDelivr npm → unpkg → jsDelivr GitHub), uses GET (not HEAD)
- Manual override field to paste a weights base URL
- Analyze button + progress + diagnostics
- Mobile‑friendly: TinyFaceDetector with size retries and 10s timeout
- Center‑crop to 768px to reduce work

Deploy (GitHub → Vercel):
  1) Upload all files to a GitHub repo (keep index.html at repo root).
  2) Vercel → Import → Framework: Other → Build: (empty) → Output: `.`
