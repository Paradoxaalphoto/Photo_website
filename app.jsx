/* YorN 1.19.1-alpha
   - Overlay toggle (symmetry lines + simple landmarks)
   - PDF export including canvas snapshot + embedded raw JSON
   - Keeps 3-file structure (index.html, app.jsx, data/baselines.json)
*/

const { useEffect, useRef, useState } = React;

function useImageLoader() {
  const [img, setImg] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = document.getElementById('file');
    inputRef.current = el;
    const onChange = e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const im = new Image();
        im.onload = () => setImg(im);
        im.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);

  return img;
}

async function fetchBaselines() {
  const res = await fetch('./data/baselines.json', { cache: 'no-store' });
  return res.json();
}

function drawImageCover(ctx, img, W, H) {
  const iw = img.width, ih = img.height;
  const r = Math.max(W / iw, H / ih);
  const nw = iw * r, nh = ih * r;
  const dx = (W - nw) / 2, dy = (H - nh) / 2;
  ctx.drawImage(img, dx, dy, nw, nh);
}

function computeMetrics(canvas) {
  // Minimal metrics to keep alpha stable & offline
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const { data } = ctx.getImageData(0, 0, W, H);

  let sum = 0, sumSq = 0;
  // luminance & contrast estimate
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2];
    sum += y; sumSq += y * y;
  }
  const n = data.length / 4;
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const contrastSigma = Math.sqrt(variance);

  // Sharpness via very light Laplacian variance proxy
  // (subsampled to keep it fast on mobile)
  let lapVarAccum = 0, lapCount = 0;
  const step = 4; // subsample step
  for (let y = 1; y < H - 1; y += step) {
    for (let x = 1; x < W - 1; x += step) {
      const idx = (y * W + x) * 4;
      const c = data[idx];
      const up = data[((y-1)*W + x) * 4];
      const dn = data[((y+1)*W + x) * 4];
      const lf = data[(y*W + (x-1)) * 4];
      const rt = data[(y*W + (x+1)) * 4];
      const lap = (4 * c) - (up + dn + lf + rt);
      lapVarAccum += lap * lap;
      lapCount++;
    }
  }
  const sharpness = Math.sqrt(lapVarAccum / Math.max(1, lapCount));

  // Center offset heuristic: assume face near brightest region centroid
  // (kept simple for alpha; you may replace with real landmarks later)
  let maxY = -1, maxX = 0, maxRow = 0;
  for (let y = 0; y < H; y += 4) {
    let rowSum = 0;
    for (let x = 0; x < W; x += 4) {
      const idx = (y * W + x) * 4;
      const lum = 0.2126 * data[idx] + 0.7152 * data[idx+1] + 0.0722 * data[idx+2];
      rowSum += lum;
      if (lum > maxY) { maxY = lum; maxX = x; maxRow = y; }
    }
  }
  const cx = W / 2, cy = H / 2;
  const offX = ((maxX - cx) / W) * 100;
  const offY = ((maxRow - cy) / H) * 100;

  return {
    time: new Date().toISOString(),
    backend: "webgl",
    brightness: Math.round(mean * 10) / 10,
    contrast_sigma: Math.round(contrastSigma * 10) / 10,
    sharpness: Math.round(sharpness * 10) / 10,
    center_offset: { x_pct: Math.round(offX * 10) / 10, y_pct: Math.round(offY * 10) / 10 },
    canvas: { w: W, h: H },
  };
}

function drawOverlays(ctx, W, H) {
  // Symmetry lines
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(122,162,255,0.85)";
  // vertical mid
  ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
  // horizontal thirds (rule-of-thirds-ish to help centering)
  const y1 = H/3, y2 = 2*H/3;
  ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(W, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(W, y2); ctx.stroke();

  // Very light "landmarks" mock (guide points)
  const pts = [
    { x: W/2, y: H/3 },         // nose/eyes center line
    { x: W/2 - W*0.12, y: H/3 },// left eye approx
    { x: W/2 + W*0.12, y: H/3 },// right eye approx
    { x: W/2, y: H*0.58 },      // mouth center approx
  ];
  ctx.fillStyle = "rgba(122,162,255,0.9)";
  pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill(); });

  ctx.restore();
}

function populateSummary(el, metrics) {
  const cells = [
    ["Brightness", metrics.brightness],
    ["Contrast σ", metrics.contrast_sigma],
    ["Sharpness (LapVar)", metrics.sharpness],
    ["Center offset X%", metrics.center_offset.x_pct],
    ["Center offset Y%", metrics.center_offset.y_pct],
  ].map(([k, v]) => `<div class="kv"><b>${k}:</b> ${v}</div>`).join("");
  el.innerHTML = cells;
}

function App() {
  const img = useImageLoader();
  const canvasRef = useRef(null);
  const [baselines, setBaselines] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [showOverlays, setShowOverlays] = useState(true);

  useEffect(() => {
    fetchBaselines().then(setBaselines).catch(() => setBaselines({ error: "Failed to load baselines.json"}));
  }, []);

  useEffect(() => {
    const chk = document.getElementById('overlayChk');
    const on = () => setShowOverlays(chk.checked);
    chk.addEventListener('change', on);
    return () => chk.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const onAnalyze = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      // clear
      ctx.fillStyle = "#0b0e13"; ctx.fillRect(0,0,canvas.width, canvas.height);

      if (img) {
        drawImageCover(ctx, img, canvas.width, canvas.height);
      } else {
        // no image: just blank and bail
        setMetrics(null);
        document.getElementById('summary').innerHTML = "";
        document.getElementById('raw').textContent = "";
        return;
      }

      // compute metrics
      const m = computeMetrics(canvas);
      setMetrics(m);

      // overlays
      if (document.getElementById('overlayChk').checked) {
        drawOverlays(ctx, canvas.width, canvas.height);
      }

      // update side panel
      populateSummary(document.getElementById('summary'), m);
      document.getElementById('raw').textContent = JSON.stringify(m, null, 2);
      document.getElementById('base').textContent = JSON.stringify(baselines ?? {}, null, 2);
    };
    analyzeBtn.addEventListener('click', onAnalyze);
    return () => analyzeBtn.removeEventListener('click', onAnalyze);
  }, [img, baselines]);

  useEffect(() => {
    // redraw overlays toggle without recomputing metrics
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    // redraw image
    ctx.fillStyle = "#0b0e13"; ctx.fillRect(0,0,canvas.width, canvas.height);
    drawImageCover(ctx, img, canvas.width, canvas.height);
    if (showOverlays) drawOverlays(ctx, canvas.width, canvas.height);
  }, [showOverlays]);

  useEffect(() => {
    // PDF button
    const pdfBtn = document.getElementById('pdfBtn');
    const onPdf = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      // Page 1: canvas snapshot
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 36;
      const availW = pageW - margin*2;
      const availH = pageH - margin*2;

      // Fit image inside page
      const imgW = canvas.width, imgH = canvas.height;
      const r = Math.min(availW / imgW, availH / imgH);
      const w = imgW * r, h = imgH * r;
      const x = (pageW - w) / 2, y = (pageH - h) / 2;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text('YorN 1.19.1-alpha — Analysis Snapshot', margin, margin - 10);
      doc.addImage(dataUrl, 'JPEG', x, y, w, h);

      // Page 2: Raw JSON
      doc.addPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text('Raw JSON — Scan Metrics', margin, margin);

      doc.setFont('courier', 'normal'); doc.setFontSize(10);
      const json = JSON.stringify({
        version: '1.19.1-alpha',
        metrics: metrics ?? {},
        baselines: baselines ?? {},
      }, null, 2);

      // Add wrapped text
      const lines = doc.splitTextToSize(json, pageW - margin*2);
      doc.text(lines, margin, margin + 18);

      doc.save(`YorN_1.19.1-alpha_${Date.now()}.pdf`);
    };
    pdfBtn.addEventListener('click', onPdf);
    return () => pdfBtn.removeEventListener('click', onPdf);
  }, [metrics, baselines]);

  return (
    <>
      <canvas id="stage" ref={canvasRef} width={1024} height={768} style={{display:"none"}} />
      {/* Canvas is manipulated directly by id=stage in index.html for CSS sizing */}
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('stage').parentElement);
root.render(<App />);