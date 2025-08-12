YorN Alpha — Mobile Detection Fix Build
--------------------------------------
Fixes:
- Removed wrong `.withFaceLandmarks(true)` (should be `.withFaceLandmarks()`).
- Force TFJS backend webgl→cpu fallback.
- TinyFaceDetector retries inputSize 320 → 224 → 160; 6s timeout.
- Preprocess: scale≤1024, rotations 0/90/270, brightness +15%, contrast +20%, optional grayscale.
- Draws detection box + confidence in overlay.
- "Load Sample Image" button to verify environment.
- Diagnostics panel shows every attempt.

Deploy:
  1) Upload to GitHub (index.html + vercel.json + README.md)
  2) Vercel → Import → Framework: Other → Build: (empty) → Output: .
