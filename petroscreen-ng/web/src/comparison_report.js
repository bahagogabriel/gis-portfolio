/** Stage 18: export a readable, source-attributed DESCRIPTIVE comparison PDF.
 * Same values as the accepted Stage16 CSV. No new measurements, map fabrication,
 * regulatory assertions, scoring, selection ranking or field-note copying.
 */
import {jsPDF} from "jspdf";
import {comparisonTable} from "./candidate_comparison.js";

const GREEN=[30,88,61],INK=[31,57,46],MUTED=[85,107,98],BORDER=[221,231,223];
export function exportComparisonPdf(items,{download=true}={}){
  const rows=comparisonTable(items); // authoritative same-radius 1..4 candidate gate
  if(items.length<2)throw Error("At least two screened candidates are needed for a comparison PDF.");
  const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4",compress:true});
  const W=297,M=15,usable=W-2*M,labelW=75,unitW=17,n=items.length,
    siteW=(usable-labelW-unitW)/n;
  let page=0,y=0;
  const drawText=(str,x,pos,size=8.1,bold=false,color=INK)=>{
    doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);
    doc.setTextColor(...color);doc.text(String(str),x,pos);
  };
  const frame=(continuation=false)=>{
    if(page)doc.addPage();
    page++;
    doc.setFillColor(...GREEN);doc.rect(0,0,W,28,"F");
    drawText("PETROSCREEN NG",M,12,17,true,[255,255,255]);
    drawText("EVIDENCE-ONLY SITE COMPARISON  |  RESEARCH PREVIEW",M,20,8,false,[227,246,229]);
    drawText("Page "+page,W-M,20,8,true,[255,255,255]);
    doc.setDrawColor(...BORDER);doc.line(M,195,W-M,195);
    drawText("ESA WorldCover 2021 v200  |  JRC GSW v1.5, 1984-2024  |  NOT A RISK RANK OR REGULATORY EIA",
      M,201,7.6,false,MUTED);
    y=35;
    if(!continuation){
      drawText(items.length+" screened candidates  ·  "+items[0].radius_km+
        " km common radius  ·  WGS84 coordinates",M,y,10.5,true);
      y+=7;
      doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(...MUTED);
      const note="Side-by-side SOURCE-DATED satellite descriptions. Values are classified pixels and "+
        "historical water observations, not onsite surveys, petroleum assets, site safety, compliance or "+
        "recommended alternative. "Not mapped" does not confirm a feature absent.";
      const lines=doc.splitTextToSize(note,usable-3);
      doc.text(lines,M,y);y+=lines.length*4.1+5;
    }
    doc.setFillColor(236,246,239);doc.rect(M,y,usable,10,"F");
    drawText("MAPPED INDICATOR",M+3,y+6.7,7.6,true,GREEN);
    drawText("UNIT",M+labelW+2,y+6.7,7.6,true,GREEN);
    for(let i=0;i<n;i++)
      drawText("SITE "+String.fromCharCode(65+i)+" · "+items[i].state,
        M+labelW+unitW+i*siteW+2,y+6.7,7.2,true,GREEN);
    y+=10;
  };
  frame(false);
  for(let k=0;k<rows.length;k++){
    const row=rows[k];
    const widths=[labelW-6,unitW-5,...Array(n).fill(siteW-6)];
    const raw=[row.label,row.unit,...row.values];
    const wrapped=raw.map((s,i)=>{
      doc.setFont("helvetica",i===0?"bold":"normal");
      doc.setFontSize(i===0?7.5:7.4);
      return doc.splitTextToSize(String(s),widths[i]);
    });
    const lineCount=Math.max(...wrapped.map(x=>x.length));
    const height=Math.max(8,lineCount*3.7+4);
    if(y+height>192)frame(true);
    if(k%2===0){doc.setFillColor(248,250,248);doc.rect(M,y,usable,height,"F");}
    let x=M;
    const widthsActual=[labelW,unitW,...Array(n).fill(siteW)];
    for(let i=0;i<wrapped.length;i++){
      doc.setFont("helvetica",i===0?"bold":"normal");
      doc.setFontSize(i===0?7.5:7.4);
      doc.setTextColor(...(i===0?INK:MUTED));
      doc.text(wrapped[i],x+2.2,y+4.3,{lineHeightFactor:1.12});
      x+=widthsActual[i];
      if(i<wrapped.length-1){
        doc.setDrawColor(...BORDER);doc.line(x,y,x,y+height);
      }
    }
    doc.setDrawColor(...BORDER);doc.line(M,y+height,W-M,y+height);
    y+=height;
  }
  const filename="PetroScreenNG_SiteComparison_"+items[0].radius_km+"km.pdf";
  if(download)doc.save(filename);
  return doc;
}
