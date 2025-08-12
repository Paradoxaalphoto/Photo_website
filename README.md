YorN Alpha — Mobile Timeout Hardening Build
-------------------------------------------
Fixes recurring "Detection timeout" by:
  - Longer default timeout (10s) with user control (3–15s)
  - Smaller detector input sizes with retries: 224 → 192 → 160 → 128
  - Auto center-crop square + downscale to 768px (reduces work)
  - Optional "Alt Engine (SSD)" toggle for capable devices
  - Diagnostics panel shows each attempt & elapsed ms
  - Progress bar + Analyze button

Deploy (GitHub → Vercel):
  1) Upload all files in this folder to a GitHub repo (keep index.html at repo root).
  2) Vercel: Import → Framework: Other → Build: (empty) → Output: `.`
