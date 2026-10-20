/** Stage 07: native-detail map from verified WorldCover GeoTIFFs.
 *
 * Only presentation changes. The research screening statistics are still
 * computed independently in engine.js from the original raster pixels.
 * The rendered patch is generated in this browser, never uploaded.
 */
const RGB={
 10:[48,110,75],20:[154,167,96],30:[196,191,121],
 40:[224,190,103],50:[214,120,86],60:[202,167,128],
 70:[236,240,239],80:[103,164,197],90:[126,176,152],
 95:[39,142,111],100:[174,169,151]
};
const DEG=Math.PI/180;
function scales(latitude){
 const p=latitude*DEG;
 return {
  east:111412.84*Math.cos(p)-93.5*Math.cos(3*p)+.118*Math.cos(5*p),
  north:111132.92-559.82*Math.cos(2*p)+1.175*Math.cos(4*p)-.0023*Math.cos(6*p)
 };
}
export async function renderNativeLandCoverPatch(lon,lat,radiusKm,images,outputPixels=1024){
 if(!images?.length)throw new Error("No verified WorldCover images for detailed map");
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||![1,3,5].includes(radiusKm))
  throw new Error("Unexpected site/radius for detailed map");
 const width=outputPixels,height=outputPixels;
 const metric=scales(lat);
 // Draw contextual area extending 50% beyond screening radius on each side.
 const halfLon=radiusKm*1500/metric.east;
 const halfLat=radiusKm*1500/metric.north;
 const west=lon-halfLon,east=lon+halfLon,south=lat-halfLat,north=lat+halfLat;
 const canvas=document.createElement("canvas");
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext("2d");
 if(!ctx)throw new Error("Canvas unavailable");
 let drawn=0;
 for(const image of images){
  const [ox,oy]=image.getOrigin(),[dx,dy]=image.getResolution();
  if(!(dx>0&&dy<0))throw new Error("Unsupported geographic raster direction");
  const x0=Math.max(0,Math.floor((west-ox)/dx));
  const x1=Math.min(image.getWidth(),Math.ceil((east-ox)/dx));
  const y0=Math.max(0,Math.floor((north-oy)/dy));
  const y1=Math.min(image.getHeight(),Math.ceil((south-oy)/dy));
  if(x1<=x0||y1<=y0)continue;
  const cellLeft=ox+x0*dx,cellRight=ox+x1*dx;
  const cellNorth=oy+y0*dy,cellSouth=oy+y1*dy;
  const px0=Math.max(0,Math.floor((cellLeft-west)/(east-west)*width));
  const px1=Math.min(width,Math.ceil((cellRight-west)/(east-west)*width));
  const py0=Math.max(0,Math.floor((north-cellNorth)/(north-south)*height));
  const py1=Math.min(height,Math.ceil((north-cellSouth)/(north-south)*height));
  const tileW=px1-px0,tileH=py1-py0;
  if(tileW<=0||tileH<=0)continue;
  const bands=await image.readRasters({window:[x0,y0,x1,y1],samples:[0],
    width:tileW,height:tileH,resampleMethod:"nearest"});
  const values=bands[0],img=ctx.createImageData(tileW,tileH);
  const nodata=Number(image.getGDALNoData()??0);
  for(let i=0;i<values.length;i++){
   const v=values[i];if(v===nodata)continue;
   const color=RGB[v];if(!color)throw new Error("Unrecognized ESA source code in native map");
   const j=i*4;img.data[j]=color[0];img.data[j+1]=color[1];img.data[j+2]=color[2];img.data[j+3]=255;
   drawn++;
  }
  // A temporary offscreen canvas keeps unclassified cells transparent.
  const tmp=document.createElement("canvas");tmp.width=tileW;tmp.height=tileH;
  tmp.getContext("2d").putImageData(img,0,0);
  ctx.drawImage(tmp,px0,py0);
 }
 if(drawn<100)throw new Error("Not enough source pixels for the detailed map");
 return {url:canvas.toDataURL("image/png"),
   coordinates:[[west,north],[east,north],[east,south],[west,south]],
   nativeSource:"ESA WorldCover 2021 v200",drawnPixels:drawn,width,height};
}
