const {useEffect,useMemo,useRef,useState} = React;
const VERSION = "1.18.0-alpha";
const flags = { overlays:true, rawDataToggle:true, pdfExport:true, demoMode:true };

// Demo landmarks (normalized 0..1)
const demoLandmarks = {
  faceTop:{x:.5,y:.12}, chin:{x:.5,y:.92},
  leftZygion:{x:.18,y:.55}, rightZygion:{x:.82,y:.55},
  leftEyeOuter:{x:.33,y:.40}, leftEyeInner:{x:.45,y:.41},
  rightEyeInner:{x:.55,y:.41}, rightEyeOuter:{x:.67,y:.40},
  noseTip:{x:.50,y:.55}, noseLeft:{x:.46,y:.56}, noseRight:{x:.54,y:.56},
  mouthLeft:{x:.42,y:.68}, mouthRight:{x:.58,y:.68},
  browLine:{x:.50,y:.33},
};

// helpers
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const symmetryScore = (lm)=>{
  const pairs=[["leftZygion","rightZygion"],["leftEyeOuter","rightEyeOuter"],["leftEyeInner","rightEyeInner"],["noseLeft","noseRight"],["mouthLeft","mouthRight"]];
  const diffs=pairs.map(([L,R])=>Math.abs((1-lm[L].x)-lm[R].x));
  const scores=diffs.map(d=>Math.max(0,1-d*2));
  return scores.reduce((a,b)=>a+b,0)/scores.length;
};
const fWHR=(lm)=>{
  const width=dist(lm.leftZygion,lm.rightZygion);
  const upperFaceH=Math.abs(lm.browLine.y - lm.noseTip.y) || .22;
  return width/upperFaceH;
};
const phiClose=(r)=>{const PHI=1.618; const rel=Math.abs(r-PHI)/PHI; return Math.max(0,1-rel);};
const goldenFace=(lm)=>phiClose(Math.abs(lm.faceTop.y-lm.chin.y)/Math.abs(lm.rightZygion.x-lm.leftZygion.x));
const goldenMouth=(lm)=>phiClose(Math.abs(lm.mouthRight.x-lm.mouthLeft.x)/(Math.abs(lm.noseRight.x-lm.noseLeft.x)||.08));
const eyeDistance=(lm)=>{const inner=dist(lm.leftEyeInner,lm.rightEyeInner); const eyeW=dist(lm.leftEyeInner,lm.leftEyeOuter); const ratio=inner/eyeW; return Math.max(0,1-Math.abs(ratio-1));};
const jawWidth=(lm)=>{const jw=Math.abs(lm.rightZygion.x-lm.leftZygion.x); const faceH=Math.abs(lm.chin.y-lm.faceTop.y); const ratio=jw/faceH; return Math.max(0,1-Math.abs(ratio-1.3)/1.3);};
const computeMetrics=(lm)=>{
  const m={ symmetry:symmetryScore(lm), fWHR:fWHR(lm), goldenFace:goldenFace(lm), goldenMouth:goldenMouth(lm), eyeDistance:eyeDistance(lm), jawWidth:jawWidth(lm) };
  const normalized={
    symmetry:m.symmetry,
    fWHR:(()=>{const c=Math.max(1.2,Math.min(2.6,m.fWHR));return (c-1.2)/(2.6-1.2);})(),
    goldenFace:m.goldenFace, goldenMouth:m.goldenMouth, eyeDistance:m.eyeDistance, jawWidth:m.jawWidth
  };
  return { raw:m, normalized };
};

const useImage = ()=>{
  const [src,setSrc]=useState(null);
  const [img,setImg]=useState(null);
  const onFile=(file)=>{ if(!file) return; const r=new FileReader(); r.onload=e=>setSrc(e.target.result); r.readAsDataURL(file); };
  useEffect(()=>{ if(!src) return; const i=new Image(); i.onload=()=>setImg(i); i.src=src; },[src]);
  return { img, src, onFile, setSrc };
};

function App(){
  const { img, src, onFile, setSrc } = useImage();
  const canvasRef = useRef(null);
  const [landmarks,setLandmarks]=useState(null);
  const [metrics,setMetrics]=useState(null);
  const [showOverlays,setShowOverlays]=useState(true);
  const [showRaw,setShowRaw]=useState(false);
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState("");

  const chartData = useMemo(()=>{
    if(!metrics) return [];
    const n=metrics.normalized;
    return [
      {name:"Symmetry", val:+(n.symmetry*100).toFixed(1)},
      {name:"fWHR", val:+(n.fWHR*100).toFixed(1)},
      {name:"Golden (Face)", val:+(n.goldenFace*100).toFixed(1)},
      {name:"Golden (Mouth)", val:+(n.goldenMouth*100).toFixed(1)},
      {name:"Eye Distance", val:+(n.eyeDistance*100).toFixed(1)},
      {name:"Jaw Width", val:+(n.jawWidth*100).toFixed(1)},
    ];
  },[metrics]);

  // draw
  useEffect(()=>{
    const cv=canvasRef.current; if(!cv||!img) return;
    const ctx=cv.getContext("2d");
    const W=640, H=Math.round((img.height/img.width)*W);
    cv.width=W; cv.height=H;
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(img,0,0,W,H);
    if(!landmarks||!showOverlays) return;
    const p2c=p=>({x:p.x*W,y:p.y*H});
    const dots=Object.values(landmarks).map(p2c);
    ctx.fillStyle="#10b981";
    dots.forEach(d=>{ctx.beginPath();ctx.arc(d.x,d.y,3,0,Math.PI*2);ctx.fill();});
    ctx.strokeStyle="#3b82f6"; ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke();
    const draw=(a,b,c)=>{const A=p2c(landmarks[a]);const B=p2c(landmarks[b]);ctx.strokeStyle=c;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();};
    draw("leftZygion","rightZygion","#f59e0b");
    draw("leftEyeOuter","leftEyeInner","#8b5cf6");
    draw("rightEyeInner","rightEyeOuter","#8b5cf6");
    draw("noseLeft","noseRight","#10b981");
    draw("mouthLeft","mouthRight","#ef4444");
    draw("faceTop","chin","#3b82f6");
  },[img,landmarks,showOverlays]);

  const runDemo = async ()=>{
    setBusy(true); setNote("Demo analysis using built-in landmarks.");
    try{
      setLandmarks(demoLandmarks);
      const m=computeMetrics(demoLandmarks);
      setMetrics(m);
      if(!src){
        const placeholder="data:image/svg+xml;utf8,"+encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1000'>
             <rect width='100%' height='100%' fill='white'/>
             <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='28' fill='#333'>YorN Demo Placeholder</text>
           </svg>`
        );
        setSrc(placeholder);
      }
    } finally { setBusy(false); }
  };

  // NOTE: ML auto-landmarks disabled in 2-file build-free mode
  const analyze = async ()=>{
    if(!img){ setNote("Upload a photo or try Demo."); return; }
    setNote("Auto-landmarks require a build. Using Demo for now."); await runDemo();
  };

  const exportPDF = ()=>{
    if(!flags.pdfExport || !metrics) return;
    const doc = new window.jspdf.jsPDF({ unit:"pt", format:"a4" });
    const margin=40; let y=margin;
    doc.setFontSize(18); doc.text(`YorN Report — ${VERSION}`, margin, y); y+=28;
    doc.setFontSize(11); doc.text("Prototype (no branding) — device-local analysis", margin, y); y+=18;

    const canvas=canvasRef.current;
    if(canvas){
      const imgData=canvas.toDataURL("image/png");
      const maxW=520; const ratio=canvas.height/canvas.width; const w=maxW; const h=w*ratio;
      doc.addImage(imgData, "PNG", margin, y, w, h); y+=h+12;
    }

    const rows=(metrics?[
      ["Symmetry", `${(metrics.normalized.symmetry*100).toFixed(1)}%`],
      ["fWHR", `${(metrics.normalized.fWHR*100).toFixed(1)}%`],
      ["Golden (Face)", `${(metrics.normalized.goldenFace*100).toFixed(1)}%`],
      ["Golden (Mouth)", `${(metrics.normalized.goldenMouth*100).toFixed(1)}%`],
      ["Eye Distance", `${(metrics.normalized.eyeDistance*100).toFixed(1)}%`],
      ["Jaw Width", `${(metrics.normalized.jawWidth*100).toFixed(1)}%`],
    ]:[]);
    doc.setFontSize(13); doc.text("Key Metrics", margin, y); y+=18; doc.setFontSize(11);
    const colX=[margin, margin+240];
    rows.forEach((r,i)=>{ const yy=y+i*18+14; doc.text(r[0], colX[0], yy); doc.text(r[1], colX[1], yy); });
    y+=rows.length*18+10;

    if(flags.rawDataToggle){
      doc.setFontSize(13); doc.text("Raw Data (landmarks + metrics)", margin, y+=22); doc.setFontSize(9);
      const raw={version:VERSION, landmarks, metrics}; const lines=doc.splitTextToSize(JSON.stringify(raw,null,2), 520);
      doc.text(lines.slice(0,40), margin, y+=16);
    }
    doc.save(`YorN_Report_${Date.now()}.pdf`);
  };

  return (
    <div>
      <main className="row">
        <section className="card">
          <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:12}}>
            <label className="btn primary">
              <input type="file" accept="image/*" style={{display:"none"}}
                     onChange={e=>onFile(e.target.files?.[0])}/>
              Select image
            </label>
            <button className="btn" onClick={runDemo} disabled={busy}>Demo</button>
            <button className="btn" onClick={analyze} disabled={busy}>Analyze</button>
            <button className="btn" onClick={()=>setShowOverlays(s=>!s)}>
              {showOverlays ? "Hide overlays" : "Show overlays"}
            </button>
            <button className="btn" onClick={()=>setShowRaw(s=>!s)}>Raw data</button>
          </div>

          <div className="card" style={{padding:0, overflow:"hidden"}}>
            <canvas ref={canvasRef} />
          </div>

          <div className="muted">{busy ? "Working…" : note}</div>
        </section>

        <section className="card">
          <div style={{fontWeight:600, marginBottom:8}}>Key metrics (normalized)</div>
          {!metrics && <div className="muted">Upload and Analyze, or run Demo.</div>}
          <div className="metrics">
            {chartData.map(r=>(
              <div key={r.name}>
                <div style={{display:"flex", justifyContent:"space-between", gap:8}}>
                  <div className="label">{r.name}</div>
                  <div className="val">{r.val}%</div>
                </div>
                <div className="bar"><div style={{width:`${r.val}%`}}></div></div>
              </div>
            ))}
          </div>

          <div style={{marginTop:12, display:"flex", gap:8, flexWrap:"wrap"}}>
            <button className="btn" onClick={exportPDF} disabled={!metrics}>Export PDF</button>
            <button className="btn" onClick={()=>{
              if(!metrics) return;
              const summary = `YorN alpha metrics: ` + chartData.map(x=>`${x.name} ${x.val}%`).join(" · ");
              navigator.clipboard?.writeText(summary);
              alert("Copied summary to clipboard.");
            }} disabled={!metrics}>Share (copy)</button>
          </div>

          {showRaw && (
            <pre className="json">
{JSON.stringify(
  { version: VERSION, landmarks: landmarks ?? "(analyze to populate)", metrics },
  null, 2
)}
            </pre>
          )}
        </section>
      </main>

      <footer className="muted" style={{padding:"16px 0"}}>
        Built for phone-only deployment • 2-file version • device-local • no branding.
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);