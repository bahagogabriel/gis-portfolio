/** Stage 07 high-resolution site view from verified in-memory ESA WorldCover.
 * Visual display ONLY. Calculations still use the independent, unchanged
 * screening engine. Downsamples native 10 m cells to a 1000px map overlay.
 */
export const WORLD_COVER_DISPLAY_COLORS=Object.freeze({10:[48,110,75],20:[154,167,96],30:[196,191,121],
  40:[224,190,103],50:[214,120,86],60:[202,167,128],
  70:[236,240,239],80:[103,164,197],90:[126,176,152],
  95:[39,142,111],100:[174,169,151]});
export const DETAIL_DISPLAY_SIZES=Object.freeze([512,1024]);
export function displayPixelBudget(size){
  if(!DETAIL_DISPLAY_SIZES.includes(size))throw new Error("Unsupported visual display size");
  return {width:size,height:size,rgbaBytes:size*size*4};
}
export async function renderSiteDetail(images,longitude,latitude,radiusKm,{displaySize=1024}={}){
  if(!images?.length || ![longitude,latitude,radiusKm].every(Number.isFinite))
    throw new Error("Expected verified geographic rasters and valid site");
  const {width:W,height:H,rgbaBytes}=displayPixelBudget(displaySize);
  const metres=radiusKm*1000*1.6;
  const lat=latitude*Math.PI/180;
  const mEast=111412.84*Math.cos(lat)-93.5*Math.cos(3*lat);
  const mNorth=111132.92-559.82*Math.cos(2*lat);
  const xHalf=metres/mEast,yHalf=metres/mNorth;
  const west=longitude-xHalf,east=longitude+xHalf;
  const north=latitude+yHalf,south=latitude-yHalf;
  const canvas=document.createElement("canvas");
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext("2d");
  const view=ctx.createImageData(W,H);
  let visiblePixels=0;
  for(const image of images){
    const [ox,oy]=image.getOrigin(),[dx,dy]=image.getResolution();
    if(!(dx>0&&dy<0))throw new Error("Non-north-up visual grid");
    const x0=Math.max(0,Math.floor((west-ox)/dx));
    const x1=Math.min(image.getWidth(),Math.ceil((east-ox)/dx));
    const y0=Math.max(0,Math.floor((north-oy)/dy));
    const y1=Math.min(image.getHeight(),Math.ceil((south-oy)/dy));
    if(x0>=x1||y0>=y1)continue;
    const values=(await image.readRasters({window:[x0,y0,x1,y1],samples:[0]}))[0];
    const rw=x1-x0,rh=y1-y0;
    const px0=Math.max(0,Math.floor((ox+x0*dx-west)/(east-west)*W));
    const px1=Math.min(W,Math.ceil((ox+x1*dx-west)/(east-west)*W));
    const py0=Math.max(0,Math.floor((north-(oy+y0*dy))/(north-south)*H));
    const py1=Math.min(H,Math.ceil((north-(oy+y1*dy))/(north-south)*H));
    for(let py=py0;py<py1;py++){
      const sampleLat=north-(py+.5)*(north-south)/H;
      const sy=Math.floor((sampleLat-(oy+y0*dy))/dy);
      if(sy<0||sy>=rh)continue;
      for(let px=px0;px<px1;px++){
        const sampleLon=west+(px+.5)*(east-west)/W;
        const sx=Math.floor((sampleLon-(ox+x0*dx))/dx);
        if(sx<0||sx>=rw)continue;
        const color=WORLD_COVER_DISPLAY_COLORS[values[sy*rw+sx]];
        if(!color)continue;
        const q=(py*W+px)*4;
        view.data[q]=color[0];view.data[q+1]=color[1];
        view.data[q+2]=color[2];view.data[q+3]=255;
        visiblePixels++;
      }
    }
  }
  if(visiblePixels<500)throw new Error("No valid source coverage for the detailed site map");
  ctx.putImageData(view,0,0);
  return {url:canvas.toDataURL("image/png"),
    coordinates:[[west,north],[east,north],[east,south],[west,south]],
    renderedPixels:visiblePixels,displaySizePx:W,rgbaBytes};
}
