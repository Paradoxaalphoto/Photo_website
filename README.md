# YorN Alpha (Vercel-ready)

This folder is deployment-ready for **GitHub → Vercel**.

## What’s inside
- `index.html` — app entry
- `static/` — compiled JS/CSS bundle
- `models/` — face-api.js models folder (ensure real model files are inside)
- `vercel.json` — SPA rewrites + long cache headers for models
- `firebase-config.js` — (optional) paste your Firebase config here if using Firestore
- `.gitignore` — basic ignores

## Deploy via GitHub (works on Android)
1. Zip this folder on your device (or keep it as-is if using the GitHub app).
2. Go to **github.com** (mobile browser) → New repository → create `yorn-alpha` (public or private).
3. Tap **Add file → Upload files** and upload **all files and folders** from this repo (make sure `index.html` is at repo root).
   - If GitHub app: you can upload files/folders one by one, or use a mobile file manager that supports folder uploads.
4. Commit to `main`.

## Connect GitHub → Vercel
1. Go to **vercel.com/new** → “**Import Git Repository**” → select your `yorn-alpha` repo.
2. Settings:
   - **Framework Preset**: **Other**
   - **Build Command**: _(leave empty)_
   - **Output Directory**: `.`
3. (Optional) Add environment or `firebase-config.js` at this stage if you use Firebase.
4. Click **Deploy** — Vercel will serve your repo at `https://<your-app>.vercel.app`.

## Notes
- Ensure your **face-api.js models** are actually present in `models/` under the same filenames your code expects.
- `vercel.json` rewrites all routes to `/index.html` for SPA routing and sets long caching for models.
- To update the site later, push new commits to GitHub; Vercel will auto-redeploy.

## Troubleshooting
- **404 on model files**: Confirm folder name is exactly `models/` and paths in code match.
- **Blank page on deep links**: `vercel.json` is missing or invalid — keep it at repo root.
- **Firebase errors**: Ensure your `firebase-config.js` has real keys and your Firestore rules allow writes in Alpha.
