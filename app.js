(() => {
  "use strict";

  const REVISION = "1.17.5-alpha";
  const $ = id => document.getElementById(id);
  const ctx = $("stage")?.getContext("2d", { willReadFrequently: true });
  let baseBitmap=null, faceModel=null, lastBox=null, lastAnalysis=null;

  /* --- Analysis and Report Export --- */
  function computeAnalysis(){
    if(!lastBox||!baseBitmap) return null;
    const w=$("stage").width, h=$("stage").height;
    const b=lastBox;
    const area_pct=(b.width*b.height)/(w*h)*100;
    const result={
      revision:REVISION,
      timestamp:new Date().toISOString(),
      image:{width:w,height:h},
      box:{...b, area_pct: +area_pct.toFixed(2)}
    };
    lastAnalysis=result;
    renderAnalysis(result);
    return result;
  }

  function renderAnalysis(a){
    $("analysisCard").style.display="";
    const kv=$("analysisKv");
    kv.innerHTML=`<div>Revision</div><div>${a.revision}</div>
      <div>When</div><div>${a.timestamp}</div>
      <div>Image</div><div>${a.image.width}×${a.image.height}</div>
      <div>Face area</div><div>${a.box.area_pct}%</div>`;
  }

  async function exportJson(){
    if(!lastAnalysis) return;
    const blob=new Blob([JSON.stringify(lastAnalysis,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`yorn-analysis-${Date.now()}.json`;a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf(){
    if(!lastAnalysis) return;
    const doc=new jspdf.jsPDF();
    doc.text("YorN Report",20,20);
    doc.text(JSON.stringify(lastAnalysis,null,2),20,40);
    doc.save(`yorn-${Date.now()}.pdf`);
  }

  /* --- Social Share with Watermark --- */
  async function renderShareImage(el, watermark="YorN Prototype"){
    const canvas = await html2canvas(el);
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.rotate(-Math.PI/8);
    ctx.font = `${Math.max(20, canvas.width*0.04)}px sans-serif`;
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.fillText(watermark, canvas.width/2, canvas.height/2);
    ctx.restore();
    return canvas.toDataURL("image/png");
  }

  async function shareImage(dataUrl, hashtags=["#YorN","#AI","#Attractiveness"]){
    if(navigator.share && navigator.canShare){
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "yorn-share.png", { type: "image/png" });
      try{
        if(navigator.canShare({ files:[file] })){
          await navigator.share({ files:[file], text:hashtags.join(" ") });
          return;
        }
      }catch{}
    }
    const a=document.createElement('a');
    a.href=dataUrl;a.download='yorn-share.png';a.click();
  }

  async function handleShare(){
    if(!lastAnalysis) return;
    const card=document.getElementById("analysisCard");
    const dataUrl=await renderShareImage(card,"YorN • Prototype");
    await shareImage(dataUrl,["#YorN","#AI","#FaceAnalysis"]);
  }

  /* --- Event Bindings --- */
  $("startAnalysisBtn").onclick=()=>computeAnalysis();
  $("exportJsonBtn").onclick=()=>exportJson();
  $("copyJsonBtn").onclick=()=>navigator.clipboard.writeText(JSON.stringify(lastAnalysis,null,2));
  $("exportPdfBtn").onclick=()=>exportPdf();
  $("shareBtn").onclick=()=>handleShare();

})();