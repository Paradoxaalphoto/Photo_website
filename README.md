YorN Alpha — Mobile Retry + Scaled Image + Analyze Button
---------------------------------------------------------
Features:
- Analyze button (disabled until photo selected)
- Progress bar + diagnostics panel (no DevTools needed)
- CDN fallback for model weights (npm → GitHub)
- TinyFaceDetector on mobile for speed + reliability
- Downscale large images to max 1024px before detection
- Automatic retries with inputSize 416 → 320 → 256 (with timeout)

Deploy (GitHub → Vercel):
1) Upload all files in this folder to a GitHub repo (keep index.html at repo root).
2) In Vercel: Import → Framework: Other → Build Command: (empty) → Output Directory: .
3) Deploy.
