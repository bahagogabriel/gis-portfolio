import test from "node:test";
import assert from "node:assert/strict";
import {countImage,screenBrowser,MAPPED_CONTEXT_CLASSES} from "../src/engine.js";

function fakeImage(defaultValue,values=new Map()){
  const width=160,height=160,origin=[6,5.01],resolution=[0.0001,-0.0001];
  return {
    getOrigin:()=>origin,getResolution:()=>resolution,
    getWidth:()=>width,getHeight:()=>height,getGDALNoData:()=>defaultValue===0?0:255,
    async readRasters({window:[x0,y0,x1,y1]}){
      const data=new Uint8Array((x1-x0)*(y1-y0));
      for(let r=y0;r<y1;r++)
        for(let c=x0;c<x1;c++)
          data[(r-y0)*(x1-x0)+(c-x0)]=values.get(r*width+c)??defaultValue;
      return [data];
    }
  };
}
const put=(map,row,col,value)=>map.set(row*160+col,value);
const coverage={type:"Polygon",coordinates:[[[5.8,4.8],[6.3,4.8],[6.3,5.3],[5.8,5.3],[5.8,4.8]]]};
test("nearest pixel centre is within requested radius and reports non-detection properly",async()=>{
  const codes=new Map();
  put(codes,50,50,80);put(codes,50,55,50);put(codes,50,60,95);
  const image=fakeImage(10,codes);
  const count=await countImage(image,6.00505,5.00495,1,"wc");
  assert.ok(count.nearestByCode[80]<2);
  assert.ok(count.nearestByCode[50]>45 && count.nearestByCode[50]<65);
  assert.ok(count.nearestByCode[95]>95 && count.nearestByCode[95]<125);
  assert.equal(count.nearestByCode[90],undefined);
  assert.equal(count.validPixels>0,true);
  const water=fakeImage(0);
  // This synthetic JRC has a valid 0 occurrence pixel layer, not pollution data.
  water.getGDALNoData=()=>255;
  const output=await screenBrowser({
    lon:6.00505,lat:5.00495,radiusKm:1,coverage,worldcoverImages:[image],
    waterImage:water,regionName:"Synthetic Test"
  });
  assert.equal(output.mapped_context_2021.indicators.length,4);
  const byCode=new Map(output.mapped_context_2021.indicators.map(x=>[x.code,x]));
  assert.equal(byCode.get(80).status,"mapped_in_study_buffer");
  assert.ok(byCode.get(80).nearest_pixel_centre_m_approx<2);
  assert.equal(byCode.get(90).status,"not_mapped_in_available_pixels");
  assert.equal(byCode.get(90).nearest_pixel_centre_m_approx,null);
  assert.ok(byCode.get(95).nearest_pixel_centre_m_approx>90);
  assert.equal(byCode.get(50).status,"mapped_in_study_buffer");
  assert.equal(output.mapped_context_2021.source,"ESA WorldCover 2021 v200");
});
test("context is only four mapped landcover codes and has no environmental risk decisions",()=>{
  assert.deepEqual(MAPPED_CONTEXT_CLASSES.map(x=>x.code),[80,90,95,50]);
  assert.ok(MAPPED_CONTEXT_CLASSES.every(x=>!/(risk level|danger score|compliant)/i.test(x.verification)));
});
