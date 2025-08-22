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