YorN Alpha — Mobile Diagnostics Build
-------------------------------------
Adds visible on-screen diagnostics so you don't need DevTools:
  - Shows last error message & step
  - Model load status
  - Detector used (Tiny or SSD)
  - File type/size, image dimensions
  - Quick network test for model weights (jsDelivr)

Deploy:
  1) Upload all files to a GitHub repo (index.html + vercel.json + README.md).
  2) Vercel → Import Git Repository → Framework: Other → Build Command: (empty) → Output Directory: .
  3) Deploy.
