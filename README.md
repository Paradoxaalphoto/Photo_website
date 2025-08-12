YorN Alpha — Mobile Preprocess + Retry + Analyze Button
------------------------------------------------------
Improves detection for "Could not detect a face" by:
  - Downscaling to max 1024px
  - Auto-rotate attempts (0°, 90°, 270°)
  - Brightness/contrast variants (normal, +15% brightness, +20% contrast)
  - TinyFaceDetector retries inputSize 480 → 416 → 320 → 256 with lower scoreThreshold (0.3)
  - On-screen diagnostics

Deploy (GitHub → Vercel):
  1) Upload all files in this folder to a GitHub repo (index.html at repo root).
  2) Vercel: Import → Framework: Other → Build: (empty) → Output: .
