(() => {
  "use strict";

  const REVISION = "1.19.1-alpha";
  let blazefaceModel;
  let lastBox = null;
  let sourceImage = null;
  let pan = {x:0,y:0};
  let liveDetect = false;

  // toast helper
  function showToast(msg){
    const d=document.createElement("div");
    d.textContent=msg;
    Object.assign(d.style,{position:"fixed",bottom:"20px",right:"20px",background:"#222",color:"#fff",padding:"8px 12px",borderRadius:"6px",zIndex:9999,opacity:"0.9",transition:"opacity 1s"});
    document.body.appendChild(d);
    setTimeout(()=>d.style.opacity="0",1500);
    setTimeout(()=>d.remove(),2500);
  }

  function log(evt,obj={}) {
    const line = JSON.stringify({time:new Date().toISOString(),type:evt,...obj});
    const diag=document.getElementById("diagnostics");
    if(diag.textContent==="No diagnostics yet.") diag.textContent="";
    diag.textContent += (diag.textContent?"\n":"")+line;
    diag.scrollTop=diag.scrollHeight;
  }

  function updateBackendChip(){
    document.getElementById("backendChip").textContent = "Backend: "+tf.getBackend()+" v"+(tf?.version_core||tf.version.tfjs);
  }

  // repaint
  function repaint(preds){
    const c=document.getElementById("photoCanvas");
    const ctx=c.getContext("2d");
    ctx.clearRect(0,0,c.width,c.height);
    if(sourceImage){
      ctx.save(); ctx.translate(pan.x,pan.y);
      ctx.drawImage(sourceImage,0,0,c.width,c.height); ctx.restore();
    }
    if(preds&&preds.length){
      drawOverlays(ctx,preds);
    } else if(lastBox){
      drawOverlays(ctx,[lastBox]);
    }
  }

  function drawOverlays(ctx,preds){
    ctx.strokeStyle="lime"; ctx.lineWidth=2;
    preds.forEach(p=>ctx.strokeRect(p.x,p.y,p.width,p.height));
  }

  function drawTips(ctx,analysis){
    if(document.getElementById("hideTips").checked) return;
    ctx.save(); ctx.fillStyle="rgba(255,255,255,0.85)"; ctx.font="14px sans-serif"; let y=20;
    (analysis.tips||[]).forEach(t=>{ctx.fillText("Tip: "+t,10,y); y+=18;});
    ctx.restore();
  }

  async function runDetect(canvas){
    if(!blazefaceModel){
      blazefaceModel=await blazeface.load();
      log("detect",{blazefaceReady:true});
    }
    const preds=await blazefaceModel.estimateFaces(canvas,false);
    lastBox=preds.length?{x:preds[0].topLeft[0],y:preds[0].topLeft[1],width:preds[0].bottomRight[0]-preds[0].topLeft[0],height:preds[0].bottomRight[1]-preds[0].topLeft[1]}:null;
    repaint(preds);
    if(preds.length){
      const a=computeAnalysis(canvas,preds[0]);
      document.getElementById("analysisResults").textContent="Global Score: "+a.global+"%";
      drawChart(a.global);
    }
    return preds;
  }

  function computeAnalysis(canvas,box){
    const area=(box.width*box.height)/(canvas.width*canvas.height)*100;
    const center={x:box.x+box.width/2,y:box.y+box.height/2};
    const cx=((center.x-canvas.width/2)/(canvas.width/2))*100;
    const cy=((center.y-canvas.height/2)/(canvas.height/2))*100;
    const tips=[];
    if(Math.abs(cx)>20||Math.abs(cy)>20) tips.push("Move face closer to center");
    const global=63;
    const a={global,tips};
    const ctx=canvas.getContext("2d");
    drawTips(ctx,a);
    return a;
  }

  function drawChart(score){
    const ctx=document.getElementById("chartCanvas").getContext("2d");
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.fillStyle="#4caf50"; ctx.fillRect(20,ctx.canvas.height-score*2,40,score*2);
    ctx.fillStyle="#000"; ctx.fillText("Global",20,ctx.canvas.height-5);
    ctx.fillText(score,20,ctx.canvas.height-score*2-5);
  }

  // exports
  async function exportPDF(){
    const c=document.getElementById("photoCanvas");
    const includeOverlays=!document.getElementById("exportOverlays").checked?false:true;
    const shot=await html2canvas(c,{backgroundColor:"#111"});
    const img=shot.toDataURL("image/png");
    const {jsPDF}=window.jspdf; const pdf=new jsPDF();
    pdf.text("YorN "+REVISION,10,10);
    pdf.addImage(img,"PNG",10,20,180,120);
    pdf.save("yorn-"+Date.now()+".pdf");
  }

  async function exportZIP(){
    const zip=new JSZip();
    const c=document.getElementById("photoCanvas");
    const shot=await html2canvas(c,{backgroundColor:"#111"});
    zip.file("canvas.png",shot.toDataURL().split(",")[1],{base64:true});
    zip.file("analysis.json",JSON.stringify({rev:REVISION,box:lastBox},null,2));
    const blob=await zip.generateAsync({type:"blob"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="yorn-"+Date.now()+".zip"; a.click();
  }

  // boot
  window.addEventListener("DOMContentLoaded",async()=>{
    document.getElementById("rev").textContent=REVISION;
    updateBackendChip();

    document.getElementById("sampleBtn").onclick=async()=>{
      const img=new Image(); img.crossOrigin="anonymous";
      img.src="https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=1024&auto=format&fit=crop";
      await img.decode(); sourceImage=img; repaint(); await runDetect(document.getElementById("photoCanvas"));
    };
    document.getElementById("detectBtn").onclick=()=>runDetect(document.getElementById("photoCanvas"));
    document.getElementById("centerBtn").onclick=()=>{ if(!lastBox)return; const c=document.getElementById("photoCanvas"); const cx=lastBox.x+lastBox.width/2, cy=lastBox.y+lastBox.height/2; pan.x-=(cx-c.width/2); pan.y-=(cy-c.height/2); repaint(); };
    document.getElementById("pdfBtn").onclick=exportPDF;
    document.getElementById("zipBtn").onclick=exportZIP;
  });

})();