const { useEffect, useRef, useState } = React;
const API_URL = (window.YORN_API_URL || "").replace(/\/+$/, "");

function useImageLoader() {
  const [img, setImg] = useState(null);
  useEffect(() => {
    const el = document.createElement("input");
    el.type = "file"; el.accept = "image/*";
    el.style.display = "block";
    el.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const im = new Image();
        im.onload = () => setImg(im);
        im.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    document.getElementById("root").prepend(el);
  }, []);
  return img;
}

function computeMetrics(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const { data } = ctx.getImageData(0, 0, W, H);
  let sum = 0, sumSq = 0;
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2];
    sum += y; sumSq += y*y;
  }
  const n = data.length/4;
  const mean = sum/n;
  const variance = Math.max(0, sumSq/n - mean*mean);
  const contrastSigma = Math.sqrt(variance);
  return { time: new Date().toISOString(), brightness: Math.round(mean*10)/10, contrast_sigma: Math.round(contrastSigma*10)/10 };
}

async function postToBackend(metrics) {
  try {
    const res = await fetch(`${API_URL}/api/uploads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "user_upload.jpg", metrics }) });
    return await res.json();
  } catch (e) { return { ok: false, reason: String(e) }; }
}

function App() {
  const img = useImageLoader();
  const canvasRef = useRef(null);
  const [metrics, setMetrics] = useState(null);
  const [uploads, setUploads] = useState([]);

  const analyze = async () => {
    if (!img) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const m = computeMetrics(canvas);
    setMetrics(m);
    const resp = await postToBackend(m);
    if (resp && resp.ok && resp.entry) setUploads(prev => [...prev, resp.entry]);
  };

  return (<div><button onClick={analyze}>Analyze</button><canvas ref={canvasRef} width={800} height={600}></canvas><pre>{JSON.stringify(metrics, null, 2)}</pre><details><summary>Uploads</summary><pre>{JSON.stringify(uploads, null, 2)}</pre></details></div>);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);