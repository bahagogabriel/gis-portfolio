/** Compact, read-only geographic source index. No network or host secrets. */
export function matchingSiteTiles(entries,lon,lat,radiusKm,scale=1.60){
  if(!Array.isArray(entries) || !Number.isFinite(lon) || !Number.isFinite(lat) ||
     ![1,3,5].includes(radiusKm))throw new Error("Invalid site/tile index");
  const p=lat*Math.PI/180;
  const eastScale=111412.84*Math.cos(p)-93.5*Math.cos(3*p)+.118*Math.cos(5*p);
  const northScale=111132.92-559.82*Math.cos(2*p)+1.175*Math.cos(4*p);
  const margin=radiusKm*1000*scale+80;
  const bbox=[lon-margin/eastScale,lat-margin/northScale,
              lon+margin/eastScale,lat+margin/northScale];
  return entries.filter(item=>{
    const b=item.bounds_lon_lat;
    if(!Array.isArray(b)||b.length!==4 || b.some(x=>!Number.isFinite(x)))
      throw new Error("Malformed verified source tile bounds");
    return b[0]<=bbox[2] && b[2]>=bbox[0] && b[1]<=bbox[3] && b[3]>=bbox[1];
  });
}
export class VerifiedTileCache{
  constructor(loader,maxFiles=24){
    this.loader=loader;this.maxFiles=maxFiles;this.cache=new Map();
  }
  async get(entry){
    const key=entry.sha256+":"+entry.file;
    if(this.cache.has(key)){
      const item=this.cache.get(key);
      this.cache.delete(key);this.cache.set(key,item);
      return item;
    }
    const load=this.loader(entry).catch(error=>{this.cache.delete(key);throw error;});
    this.cache.set(key,load);
    while(this.cache.size>this.maxFiles)
      this.cache.delete(this.cache.keys().next().value);
    return load;
  }
  async preload(entries){
    return Promise.all(entries.map(x=>this.get(x)));
  }
}
