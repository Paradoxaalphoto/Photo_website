import React, { useEffect, useMemo, useRef, useState } from "react";

// Charts + utils
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { jsPDF } from "jspdf";
import { motion } from "framer-motion";
import { Upload, Image as ImageIcon, Play, Eye, EyeOff, FileText, Share2, Cpu, Camera } from "lucide-react";

const VERSION = "1.18.0-alpha";

// --- Feature flags (patch-friendly) ---
const flags = {
  overlays: true,
  rawDataToggle: true,
  pdfExport: true,
  webShare: true, // will gracefully noop if not supported
  demoMode: true,
};

// --- Minimal sample landmarks (normalized 0..1) for Demo Mode ---
const demoLandmarks = {
  faceTop: { x: 0.50, y: 0.12 },
  chin: { x: 0.50, y: 0.92 },
  leftZygion: { x: 0.18, y: 0.55 },
  rightZygion: { x: 0.82, y: 0.55 },
  leftEyeOuter: { x: 0.33, y: 0.40 },
  leftEyeInner: { x: 0.45, y: 0.41 },
  rightEyeInner: { x: 0.55, y: 0.41 },
  rightEyeOuter: { x: 0.67, y: 0.40 },
  noseTip: { x: 0.50, y: 0.55 },
  noseLeft: { x: 0.46, y: 0.56 },
  noseRight: { x: 0.54, y: 0.56 },
  mouthLeft: { x: 0.42, y: 0.68 },
  mouthRight: { x: 0.58, y: 0.68 },
  browLine: { x: 0.50, y: 0.33 },
};

// --- Helpers ---
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const symmetryScore = (lm) => {
  const pairs = [
    ["leftZygion", "rightZygion"],
    ["leftEyeOuter", "rightEyeOuter"],
    ["leftEyeInner", "rightEyeInner"],
    ["noseLeft", "noseRight"],
    ["mouthLeft", "mouthRight"],
  ];
  const diffs = pairs.map(([L, R]) => Math.abs((1 - lm[L].x) - lm[R].x));
  const scores = diffs.map((d) => Math.max(0, 1 - d * 2));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
};

const fWHR = (lm) => {
  const width = dist(lm.leftZygion, lm.rightZygion);
  const upperFaceH = Math.abs(lm.browLine.y - lm.noseTip.y) || 0.22;
  return width / upperFaceH;
};

const closenessToPhi = (ratio) => {
  const PHI = 1.618;
  const rel = Math.abs(ratio - PHI) / PHI;
  return Math.max(0, 1 - rel);
};

const goldenFace = (lm) => {
  const faceLen = Math.abs(lm.faceTop.y - lm.chin.y);
  const faceWid = Math.abs(lm.rightZygion.x - lm.leftZygion.x);
  return closenessToPhi(faceLen / faceWid);
};

const goldenMouth = (lm) => {
  const mouthW = Math.abs(lm.mouthRight.x - lm.mouthLeft.x);
  const noseW = Math.abs(lm.noseRight.x - lm.noseLeft.x) || 0.08;
  return closenessToPhi(mouthW / noseW);
};

const eyeDistance = (lm) => {
  const inner = dist(lm.leftEyeInner, lm.rightEyeInner);
  const eyeW = dist(lm.leftEyeInner, lm.leftEyeOuter);
  const ratio = inner / eyeW;
  const rel = Math.abs(ratio - 1);
  return Math.max(0, 1 - rel);
};

const jawWidth = (lm) => {
  const jw = Math.abs(lm.rightZygion.x - lm.leftZygion.x);
  const faceH = Math.abs(lm.chin.y - lm.faceTop.y);
  const ratio = jw / faceH;
  const rel = Math.abs(ratio - 1.3) / 1.3;
  return Math.max(0, 1 - rel);
};

const computeMetrics = (lm) => {
  const m = {
    symmetry: symmetryScore(lm),
    fWHR: fWHR(lm),
    goldenFace: goldenFace(lm),
    goldenMouth: goldenMouth(lm),
    eyeDistance: eyeDistance(lm),
    jawWidth: jawWidth(lm),
  };
  const normalized = {
    symmetry: m.symmetry,
    fWHR: (() => {
      const clamped = Math.max(1.2, Math.min(2.6, m.fWHR));
      return (clamped - 1.2) / (2.6 - 1.2);
    })(),
    goldenFace: m.goldenFace,
    goldenMouth: m.goldenMouth,
    eyeDistance: m.eyeDistance,
    jawWidth: m.jawWidth,
  };
  return { raw: m, normalized };
};
const useImage = () => {
  const [src, setSrc] = useState(null);
  const [img, setImg] = useState(null);
  const onFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setSrc(e.target.result);
    reader.readAsDataURL(file);
  };
  useEffect(() => {
    if (!src) return;
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  return { img, src, onFile, setSrc };
};

export default function App() {
  const { img, src, onFile, setSrc } = useImage();
  const canvasRef = useRef(null);
  const [landmarks, setLandmarks] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [showOverlays, setShowOverlays] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const chartData = useMemo(() => {
    if (!metrics) return [];
    const n = metrics.normalized;
    return [
      { name: "Symmetry", value: +(n.symmetry * 100).toFixed(1) },
      { name: "fWHR", value: +(n.fWHR * 100).toFixed(1) },
      { name: "Golden (Face)", value: +(n.goldenFace * 100).toFixed(1) },
      { name: "Golden (Mouth)", value: +(n.goldenMouth * 100).toFixed(1) },
      { name: "Eye Distance", value: +(n.eyeDistance * 100).toFixed(1) },
      { name: "Jaw Width", value: +(n.jawWidth * 100).toFixed(1) },
    ];
  }, [metrics]);
// Draw overlays on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    const W = 640;
    const H = Math.round((img.height / img.width) * W);
    canvas.width = W;
    canvas.height = H;

    // draw image
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    if (!landmarks || !showOverlays) return;

    // points helper
    const p2c = (p) => ({ x: p.x * W, y: p.y * H });
    const dots = Object.values(landmarks).map(p2c);

    // draw dots
    ctx.fillStyle = "#10b981"; // emerald
    for (const d of dots) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // midline
    ctx.strokeStyle = "#3b82f6"; // blue
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();

    // connect a few features
    const drawLine = (a, b, color = "#ef4444") => {
      const A = p2c(landmarks[a]);
      const B = p2c(landmarks[b]);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    };
    drawLine("leftZygion", "rightZygion", "#f59e0b");
    drawLine("leftEyeOuter", "leftEyeInner", "#8b5cf6");
    drawLine("rightEyeInner", "rightEyeOuter", "#8b5cf6");
    drawLine("noseLeft", "noseRight", "#10b981");
    drawLine("mouthLeft", "mouthRight", "#ef4444");
    drawLine("faceTop", "chin", "#3b82f6");
  }, [img, landmarks, showOverlays]);

  const runDemo = async () => {
    setBusy(true);
    setNote("Demo analysis using built-in landmarks.");
    try {
      setLandmarks(demoLandmarks);
      const m = computeMetrics(demoLandmarks);
      setMetrics(m);
      if (!src) {
        // inject a placeholder if user hasn't uploaded
        const placeholder =
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1000'>
              <rect width='100%' height='100%' fill='white'/>
              <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='28' fill='#333'>YorN Demo Placeholder</text>
            </svg>`
          );
        setSrc(placeholder);
      }
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    if (!img) {
      setNote("Upload a photo or try Demo.");
      return;
    }
    setBusy(true);
    setNote("Loading face model (local, device-only)…");
    try {
      const tfcore = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-webgl");
      await tfcore.setBackend("webgl");
      const fLd = await import("@tensorflow-models/face-landmarks-detection");
      const mp = fLd.SupportedModels.MediaPipeFaceMesh;
      const detector = await fLd.createDetector(mp, {
        runtime: "tfjs",
        refineLandmarks: true,
      });
      const temp = document.createElement("canvas");
      const tctx = temp.getContext("2d");
      temp.width = img.width;
      temp.height = img.height;
      tctx.drawImage(img, 0, 0);
      const faces = await detector.estimateFaces(temp, { flipHorizontal: false });
      if (!faces?.length) throw new Error("No face detected");
      const f = faces[0];
      const get = (i) => ({ x: f.keypoints[i].x / img.width, y: f.keypoints[i].y / img.height });
      const lm = {
        faceTop: get(10),
        chin: get(152),
        leftZygion: get(234),
        rightZygion: get(454),
        leftEyeOuter: get(130),
        leftEyeInner: get(133),
        rightEyeInner: get(362),
        rightEyeOuter: get(263),
        noseTip: get(1),
        noseLeft: get(97),
        noseRight: get(326),
        mouthLeft: get(61),
        mouthRight: get(291),
        browLine: get(105),
      };
      setLandmarks(lm);
      setMetrics(computeMetrics(lm));
      setNote("Analysis complete.");
    } catch (err) {
      console.warn("Analyzer fallback:", err);
      setNote("Model unavailable here. Showing Demo metrics instead.");
      await runDemo();
    } finally {
      setBusy(false);
    }
  };
const exportPDF = () => {
    if (!flags.pdfExport || !metrics) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    let y = margin;

    doc.setFontSize(18);
    doc.text(`YorN Report — ${VERSION}`, margin, y);
    y += 10;
    doc.setFontSize(11);
    doc.text("Prototype (no branding) — device-local analysis", margin, (y += 18));

    // Image (canvas) snapshot
    const canvas = canvasRef.current;
    if (canvas) {
      const imgData = canvas.toDataURL("image/png");
      const maxW = 520;
      const ratio = canvas.height / canvas.width;
      const w = maxW;
      const h = w * ratio;
      doc.addImage(imgData, "PNG", margin, (y += 12), w, h);
      y += h + 8;
    }

    // Metrics
    const n = metrics.normalized;
    const rows = [
      ["Symmetry", `${(n.symmetry * 100).toFixed(1)}%`],
      ["fWHR", `${(n.fWHR * 100).toFixed(1)}%`],
      ["Golden (Face)", `${(n.goldenFace * 100).toFixed(1)}%`],
      ["Golden (Mouth)", `${(n.goldenMouth * 100).toFixed(1)}%`],
      ["Eye Distance", `${(n.eyeDistance * 100).toFixed(1)}%`],
      ["Jaw Width", `${(n.jawWidth * 100).toFixed(1)}%`],
    ];

    doc.setFontSize(13);
    doc.text("Key Metrics", margin, (y += 22));
    doc.setFontSize(11);
    const colX = [margin, margin + 240];
    rows.forEach((r, i) => {
      const yy = y + i * 18 + 14;
      doc.text(r[0], colX[0], yy);
      doc.text(r[1], colX[1], yy);
    });
    y += rows.length * 18 + 16;

    // Raw JSON (landmarks + metrics)
    if (flags.rawDataToggle) {
      doc.setFontSize(13);
      doc.text("Raw Data (landmarks + metrics)", margin, (y += 22));
      doc.setFontSize(9);
      const raw = {
        version: VERSION,
        landmarks,
        metrics,
      };
      const rawText = JSON.stringify(raw, null, 2);
      const lines = doc.splitTextToSize(rawText, 520);
      const maxLines = 40; // keep tidy in prototype
      doc.text(lines.slice(0, maxLines), margin, (y += 16));
    }

    doc.save(`YorN_Report_${Date.now()}.pdf`);
  };

  const shareResults = async () => {
    if (!flags.webShare || !metrics) return;
    try {
      const canvas = canvasRef.current;
      const blob = await new Promise((res) => canvas.toBlob(res));
      const files = blob ? [new File([blob], "yorn.png", { type: "image/png" })] : [];
      const text = `YorN alpha metrics: ${chartData.map((r) => `${r.name} ${(r.value).toFixed(1)}%`).join(" · ")}`;
      if (navigator.share && (navigator.canShare ? navigator.canShare({ files }) : true)) {
        await navigator.share({ title: "YorN alpha", text, files });
      } else {
        await navigator.clipboard.writeText(text);
        alert("Copied summary to clipboard (Web Share not supported).");
      }
    } catch (e) {
      console.warn(e);
      alert("Sharing not supported in this environment.");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5" />
            <div className="text-sm">YorN • Prototype • v{VERSION}</div>
          </div>
          <div className="text-xs opacity-70">No branding • Device-local • Ottawa dev ✦</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Image + overlay */}
        <section className="lg:col-span-7">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center gap-2 mb-3 text-sm">
              <Upload className="w-4 h-4" />
              <span>Upload a face photo (front-facing, good light). All processing stays on-device.</span>
            </div>
            <div className="flex gap-2 mb-3">
              <label className="inline-flex items-center gap-2 px-3 py-2 bg-neutral-900 text-white rounded-xl cursor-pointer">
                <Camera className="w-4 h-4" />
                <span>Select image</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
              <button
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border"
                onClick={runDemo}
                disabled={busy}
              >
                <Play className="w-4 h-4" /> Demo
              </button>
              <button
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border"
                onClick={analyze}
                disabled={busy}
              >
                <ImageIcon className="w-4 h-4" /> Analyze
              </button>
              {flags.overlays && (
                <button
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border"
                  onClick={() => setShowOverlays((s) => !s)}
                >
                  {showOverlays ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} Overlays
                </button>
              )}
              {flags.rawDataToggle && (
                <button
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border"
                  onClick={() => setShowRaw((s) => !s)}
                >
                  <FileText className="w-4 h-4" /> Raw data
                </button>
              )}
            </div>

            <div className="rounded-xl overflow-hidden border bg-neutral-100">
              <canvas ref={canvasRef} className="w-full h-auto block" />
            </div>

            <div className="mt-2 text-xs text-neutral-500 min-h-[1.5rem]">{busy ? "Working…" : note}</div>
          </div>
        </section>

        {/* Right: Metrics + actions */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-sm font-medium mb-2">
              Key metrics (normalized)
              <span className="text-xs font-normal opacity-60"> • higher is closer to target range</span>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!metrics && (
              <div className="text-xs text-neutral-500">Upload an image and click Analyze, or try Demo.</div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow p-4 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border disabled:opacity-50"
              onClick={exportPDF}
              disabled={!metrics}
            >
              <FileText className="w-4 h-4" /> Export PDF
            </button>
            <button
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border disabled:opacity-50"
              onClick={shareResults}
              disabled={!metrics}
              title="Beta: shares summary text and image via Web Share when available"
            >
              <Share2 className="w-4 h-4" /> Share (beta)
            </button>
          </div>

          {showRaw && (
            <motion.pre
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-neutral-900 text-neutral-100 text-xs p-3 rounded-2xl overflow-auto max-h-[320px]"
            >
{JSON.stringify(
  {
    version: VERSION,
    landmarks: landmarks ?? "(analyze to populate)",
    metrics,
  },
  null,
  2
)}
            </motion.pre>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl p-6 text-xs text-neutral-500">
        Built for alpha prototyping • core-only • zero branding • easy patching. Next steps: add demographic charts & desktop/Android wrappers.
      </footer>
    </div>
  );
}