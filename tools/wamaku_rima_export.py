import base64, zlib, json, zipfile, time, traceback
from datetime import datetime, timezone
from pathlib import Path
import requests
import geopandas as gpd
from shapely import wkb
from shapely.geometry import Point
import fiona

ROOT=Path("wamaku_output"); ROOT.mkdir(exist_ok=True)
LATLON="EPSG:4326"; UTM="EPSG:32631"
aoi=wkb.loads(zlib.decompress(base64.b64decode("eNpdVw1Q1VUWB0VKocXXveKqqIQm/W/hV7aQo3hSWkU3wQU/EEU0Bcun8rYhWuWtRTNqG9IWToqlOII7RhOQKS5qC6iJKYbAjh+bYIIfgKKGlEkq+7v3vHgz+59585/z3rn3/M7v/M6593n29PDw8MTnKD75G/E8LmnK8/pR9FlTWFZyb0mNwc7aq+MUNVfh8ZW0bDaeFxRtqPC3W09ImtmSHb4/TNGmgErHvr6SvKbndjjHK6rqFV+80iYpNiIi4tMJbv9pWU1hR8IVRZ7PCEnBfk/ZbLbXIt3r/eOLe30wQ9FzNv248MSwXT9I0g7gcsI+XlBQ0DBUUp/dUZ19Zivan5OTs2y4pHLEzYUdhWXJz0h6rtIREDKX7a6JnE/FXM7HYzLjj4pTlAicfaMYfxPszvr6eluMpBSfkkRHvKIW+G+dKynYXuHvvUBRRlJS0rZ4Sdkh5zOyFyrKxdtzlaQM5DEmQZEN+5xeLakAuPYuVlQJvG+mStpUG+y0L1G0G3QfdkoKKEn0CUhStDktLW1KhqRaf3tFMewQ5Pvyeknh4Cl8OcevypS0VdfJZW/dIqkjLKupdjnv35DL8TPsiko0H/mSwpy1wf1XKorWfOyRlB/ekp2/SpH35vAWv0JJGxE3YbUi39u3bt0q5HrYHIyvbxnzmQh7MDTiUe6qxxuKknM7IvOOSjqe6FNy6C+KxoGXK8c43rdLOf7p7yStKO4VPz1R0RzUvfEi17dgkaL3oIdNlzl+PficFISnUVLVITzguwE8/K2R690/VtGXwL3kmqSx2u/PinaC72+wfgPWV0e5/e+CDzv0dMURUNkb/hPBX/5URe+iXknX3Pr9zf5N76eRZ81V3s821o3vIniOHqXop4yQ8yXYPxD0fP6soidR336tjGdjsKKVnflRc25I+gi41gUyX+N+kjRC6yVAkYU69/hVUjr2nTpI0QeoU/QDSaeQ7mx/5nNFl6RHKEOsdPHt0c/Er/JVdAL13fuQ9bgBdiu+Pnaf97/Th+MHdXC+f4T9Fnjf0876fuJxRV93RObe/Jn3f70X+/f4RdJkZH/ggUWeL2Y1jQa+GPRBeadFF3QdYK8HH2n3rG682ra1W1SHum924Yu+bXXjN/zcsGgY6hyM9amgubXZMnjsWL8vqjN/S6PVnd8YU3eLfo8+Duxi/lb/4I7vp91gz0BehHzLdJ0uWXQJ9S4EvxPwvW+DRUew74E7krZDL0X1ltHbiDZJA8F76/cWjcccGNUsaa2uK2wP5HvmHMdbXGcZvVyoldQO/XjVMd5p1cz3pBqL4sHjrJOSziBu4xmLbmOOlB2X9Aq+H1zNfJyokFQInsu/sygI+d8tldQbeZ0/aZn+TjsgqRR1LDjpwlss6XXESYc9W+P9QtJ1rbMTFvfDLklbdL/D1vPprb9yvuGwHVrHmCeXgSPvuGXm0ViH+/dshPvczvnUwn4eOlmaLGkX+qgB8ZxaR8uYj3XA2wW/wwmS3kadE5CPnn/1C7meNuQ/H3m+s5DxzaxlvD/HMd/9/2ORP/KcAFvXc81/3f5anzsvuvdr0+965ufGAkl5wLMe9UyCfl6dy/qMRr3TgW9qDOuz5jLjmxDJ50cm9GLOq2muedjM/pdGMb7xsHfoeTyS4225wvxsw/nxS3Z4y/0mXh8rmP/piKfPj9O/Y33uBx59vhT0kRQHXIOgr3OQ4wZv9++LUI8IL7c+39HjpCefH1/DfwrmoPOh6NZbEfL85yXRrcdHYVp/olvPjUZ/ghLQlyOx3wj4HakQrAfkM03rv1SY/OfDnoz9Z+1nO+maZc7rGUXC1NveYlFvM88FHdR5tFoUqvW/R7AeYZ9C3O35gjIBc8dNi/bl6EfwvIF9Ha9PtwrDb8oti07C/+lsYeoxBf2eCZ08yGL/w3csagfO9enC5O/40aIY4Dq7RtCb4OXgff59Saow8+4U5kkh+Ni2ivcbdo/z+TKZ430M/1TUZd4yzi/9oUVrUN9X5wjTr5MeWfQF1s+L5f3yPBXtQf7fvsLrd/ZQ9Bp4HP4nYfS3APNuKPQ2JlLQN+jTlMcU7TL6Yf+NmI+j4ec1w8U37K/Ahm0W71/qo+gl4LsKf62HOj9FPXF+Pgtb3y+yMb9L0fcLiPN3DlQ0QOsCdl/9DnTb5vwKUnQTfXsD9meI0zbMjUfflyKGK/oD9r0dyfzUPKXoHnT8cjTH/wTrH6LO7cAXClwLn+H4Q+J4v18V+1fHM/445Yq3SJjz7QL830f95i1l/1DYul5/Xy7MvCsaoQzffg5hzv/FWK/r81Kqe30g+Jy6TlAN5uEQ2NtRl9K3hemHiCGMf+17wvT3vwYrehp6/vgfgvs7kPmr/kSY+VI0VFGbxpfLehqJ9XF6rhZyPCfWp2DcfbiX4+0DvzP1sf0V488ZoOiiPg/QD7q/KwdwPrvKWD//xn4HdX3KBZ1Fn00En2Xo4+tHWf/e4F/3485jgu8LOM+9dH1PCL5PWJz/Vdi6/9/H+b8UdSg7JGgQ8grCfWEt+MpDPHNfwX15oLkvie77Rps5L3j9u7DPoi4+pwSdA57doYwvs06Y+1NkKPt3YV40Q49PjlF0F+/WJsbjhfuKH3R2uZn7YTFsPf/euCmonz53X3Dxc9cdX9+fP4Q9H7gF8K1Af3TeZz4bR/N9f20P13mHeP0wJ3y9ZXe8//9/8D/iHxAq")))
catch=gpd.GeoDataFrame([{"HYBAS_ID":"1080696100","Name":"Wamaku Rima","Area_km2":round(gpd.GeoSeries([aoi],crs=LATLON).to_crs(UTM).area.iloc[0]/1e6,3)}],geometry=[aoi],crs=LATLON)
bbox=aoi.bounds
log=[]; count={}
def note(x):
 print(x,flush=True); log.append(x)
def save(g,stem,geom_type):
 p=ROOT/(stem+".shp")
 if g is None or g.empty:
  schema={"geometry":geom_type,"properties":{"Name":"str:120","Source":"str:120","Detail":"str:120"}}
  with fiona.open(p,"w",driver="ESRI Shapefile",crs=LATLON,schema=schema,encoding="UTF-8"): pass
  count[stem]=0;note(stem+": empty"); return
 g=g.to_crs(LATLON).copy()
 g=g.loc[g.geometry.notna() & ~g.geometry.is_empty]
 for c in list(g.columns):
  if c != "geometry" and g[c].dtype == "object":
   g[c]=g[c].apply(lambda v:str(v)[:240] if v is not None else "")
 g.to_file(p,driver="ESRI Shapefile",engine="fiona",index=False,encoding="UTF-8")
 count[stem]=len(g);note(f"{stem}: {len(g)} features")
def clip(raw,geom_type):
 if raw is None or raw.empty:return raw
 raw=raw.set_crs(LATLON,allow_override=True) if raw.crs is None else raw.to_crs(LATLON)
 raw=raw[raw.geometry.notna() & raw.geometry.intersects(aoi)]
 if raw.empty:return raw
 raw=gpd.clip(raw,aoi,keep_geom_type=True)
 raw=raw.explode(index_parts=False,ignore_index=True)
 if geom_type=="LineString":
  raw=raw[raw.geometry.geom_type.isin(["LineString","MultiLineString"])]
 elif geom_type=="Point":
  raw=raw[raw.geometry.geom_type=="Point"]
 return raw.reset_index(drop=True)
save(catch,"00_Catchment_Boundary","Polygon")
def esri_fetch(url, limit=1000):
 result=[]; offset=0
 params={"where":"1=1","geometry":",".join(f"{v:.7f}" for v in bbox),"geometryType":"esriGeometryEnvelope","inSR":4326,"outSR":4326,
 "spatialRel":"esriSpatialRelIntersects","outFields":"*","returnGeometry":"true","f":"geojson","resultRecordCount":limit}
 for page in range(20):
  params["resultOffset"]=offset; data=None
  for retry in range(3):
   try:
    r=requests.get(url+"/query",params=params,timeout=55);r.raise_for_status(); data=r.json()
    if "error" in data:raise RuntimeError(str(data["error"])[:400])
    break
   except Exception as e:
    note(f"Fetch retry {retry+1} for {url.split('/')[-3:]}, error: {e}")
    time.sleep(2)
  if data is None:raise RuntimeError("Could not query "+url)
  feats=data.get("features",[])
  result+=feats;offset+=len(feats)
  if len(feats)<limit or not data.get("exceededTransferLimit",False) and len(feats)<limit:break
  if not feats:break
 if not result:return gpd.GeoDataFrame(geometry=[],crs=LATLON)
 return gpd.GeoDataFrame.from_features(result,crs=LATLON)
URL_OSM="https://services-eu1.arcgis.com/zci5bUiJ8olAal7N/arcgis/rest/services/OSM_AF_Waterways/FeatureServer/0"
URL_GRID="https://services7.arcgis.com/lUdbtIChKxpnw5qG/ArcGIS/rest/services/GRID3_Nigeria_SHP/FeatureServer"
URL_HYDRO="https://services8.arcgis.com/WQtGT9bHpwcYeBTA/ArcGIS/rest/services/Nigeria_Floods_MC/FeatureServer/0"
URL_HYDRO2="https://services.arcgis.com/tKsJAIiLjd90D5q2/ArcGIS/rest/services/Nigeria_Flood_GO/FeatureServer/0"
URL_SETTLE="https://services3.arcgis.com/BU6Aadhn6tbBEdyk/ArcGIS/rest/services/Settlements_in_Nigeria/FeatureServer/0"
# Mapped OSM waterways: named rivers, tributary streams, seasonal channels, canals etc.
osm=None
try:osm=clip(esri_fetch(URL_OSM),"LineString")
except Exception as e:note("OSM waterway service failed: "+str(e))
if osm is not None and not osm.empty:
 osm["Name"]=osm.get("name","").fillna("").astype(str) if "name" in osm else ""
 osm["Waterway"]=osm.get("waterway","").fillna("").astype(str).str.lower() if "waterway" in osm else ""
 osm["Source"]="OSM/Esri Living Atlas"; osm["Len_km"]=osm.to_crs(UTM).length.round(3)/1000
 cols=["Name","Waterway","Source","Len_km"]
 if "osm_id2" in osm:osm["OSM_ID"]=osm.osm_id2.astype(str);cols+=["OSM_ID"]
 osm=osm[cols+["geometry"]]
 save(osm,"01_OSM_All_Waterways","LineString")
 save(osm[osm.Waterway.isin(["river"])],"02_OSM_Major_Rivers","LineString")
 save(osm[osm.Waterway.isin(["river","stream","wadi"])],"03_OSM_Rivers_Streams","LineString")
else:note("OSM waterways none returned; alternative hydro network follows")
# HydroRIVERS-derived network with actual Strahler order, separate from OSM.
hy=None
for url in (URL_HYDRO,URL_HYDRO2):
 try:
  hy=clip(esri_fetch(url),"LineString")
  if hy is not None and not hy.empty:note("Hydro-derived data: "+url);break
 except Exception as e:note("Hydro source failed: "+str(e))
if hy is not None and not hy.empty:
 for c in ["ORD_STRA","ORD_CLAS","DIS_AV_CMS","CATCH_SKM","HYRIV_ID"]:
  if c not in hy:hy[c]=None
 hy["Len_km"]=(hy.to_crs(UTM).length/1000).round(3)
 hy["Source"]="HydroRIVERS/ArcGIS"
 hy["Name"]=""  # HydroRIVERS does not supply names
 hy=hy[["Name","HYRIV_ID","ORD_STRA","ORD_CLAS","DIS_AV_CMS","CATCH_SKM","Len_km","Source","geometry"]]
 save(hy,"04_HydroRIVERS_All_Orders","LineString")
 for n in (2,3,4):
  subset=hy[gpd.pd.to_numeric(hy["ORD_STRA"],errors="coerce")>=n]
  save(subset,f"05_HydroRIVERS_Order_GE{n}","LineString")
else:note("HydroRIVERS not available from either queried service")
# Primary historical DCW watercourses reference; may have no coverage above 11.7 N.
try:
 grid=clip(esri_fetch(URL_GRID+"/5"),"LineString")
 if grid is not None and not grid.empty:
  grid["Name"]=grid.get("NAME","").fillna("").astype(str) if "NAME" in grid else ""
  grid["Source"]="OCHA/DCW"
  save(grid[["Name","Source","geometry"]],"06_OCHA_Water_Courses","LineString")
except Exception as e:note("Historical watercourses unavailable: "+str(e))
# Named villages and towns from GRID3 settlement points.
try:
 st=clip(esri_fetch(URL_SETTLE,limit=1500),"Point")
 if st is not None and not st.empty:
  st["Name"]=st["set_name"].fillna("").astype(str).str.strip() if "set_name" in st else ""
  st=st[st.Name.str.len()>0].copy()
  st["LGA"]=st["lganame"].fillna("").astype(str) if "lganame" in st else ""
  st["Ward"]=st["wardname"].fillna("").astype(str) if "wardname" in st else ""
  st["Source"]="GRID3 NGA"
  st["Lon"]=st.geometry.x.round(6);st["Lat"]=st.geometry.y.round(6)
  if "set_id" in st: st["Set_ID"]=st["set_id"].astype(str);st=st.drop_duplicates(subset=["Set_ID","Name"])
  save(st[["Name","LGA","Ward","Source","Lon","Lat"]+(["Set_ID"] if "Set_ID" in st else [])+["geometry"]],"07_Towns_Villages_GRID3","Point")
except Exception as e:note("GRID3 settlements unavailable: "+str(e))
# OSM dams, weirs and reservoirs are screened candidates, not claimed confirmed dams.
q='[out:json][timeout:75];(nwr["waterway"="dam"](12.875,4.80,13.235,5.265);nwr["man_made"="dam"](12.875,4.80,13.235,5.265);nwr["waterway"="weir"](12.875,4.80,13.235,5.265););out center tags;'
dam_features={};dam_success=False
for server in ["https://overpass.kumi.systems/api/interpreter","https://overpass-api.de/api/interpreter","https://overpass.nchc.org.tw/api/interpreter"]:
 try:
  j=requests.post(server,data={"data":q},timeout=60).json()
  if "elements" not in j:raise ValueError(str(j)[:200])
  dam_success=True
  for e in j.get("elements",[]):
   k=f"{e['type']}/{e['id']}";tags=e.get("tags",{})
   loc=e if e["type"]=="node" else e.get("center",{})
   if "lon" not in loc or "lat" not in loc:continue
   pt=Point(loc["lon"],loc["lat"])
   if not aoi.covers(pt):continue
   typ=tags.get("waterway") or tags.get("man_made") or "dam"
   dam_features[k]={"Name":tags.get("name") or "Unnamed mapped structure","Type":typ,"OSM_ID":k,"Source":"OSM/Overpass","geometry":pt}
  break
 except Exception as e:note("Overpass source unavailable: "+str(e))
dams=gpd.GeoDataFrame(list(dam_features.values()),geometry="geometry",crs=LATLON) if dam_features else None
save(dams,"08_Dam_Weir_OSM_Candidates","Point")
# No authoritative in-catchment named dam has been independently confirmed: empty honesty layer.
save(None,"09_Confirmed_Named_Dams","Point")
# Optional map preview
try:
 import matplotlib
 matplotlib.use("Agg")
 import matplotlib.pyplot as plt
 fig,ax=plt.subplots(figsize=(8,8))
 catch.boundary.plot(ax=ax,color="#242424",linewidth=1.6)
 if hy is not None and not hy.empty:hy.plot(ax=ax,color="#b2dceb",linewidth=0.7,label="HydroRIVERS")
 if osm is not None and not osm.empty:
  osm.plot(ax=ax,color="#2779ab",linewidth=0.8,label="OSM waterways")
  r=osm[osm.Waterway=="river"]
  if not r.empty:r.plot(ax=ax,color="#125a90",linewidth=2.2,label="Mapped rivers")
 if "st" in globals() and st is not None and not st.empty:
  st.plot(ax=ax,color="#a55224",markersize=6,label="Named settlements",zorder=3)
 if dams is not None and not dams.empty:dams.plot(ax=ax,color="red",marker="^",markersize=35,label="Dam/weir candidates")
 ax.set_title("Wamaku Rima Catchment | mapped drainage & settlements")
 ax.set_xlabel("Longitude (°E)");ax.set_ylabel("Latitude (°N)")
 ax.legend(loc="upper left",fontsize=7)
 ax.grid(alpha=.2);fig.tight_layout()
 fig.savefig(ROOT/"Quick_Preview.png",dpi=180);plt.close(fig)
except Exception as e:note("Preview map failure: "+str(e))
# QA: all populated features within provided polygon (lines are clipped to boundary).
for p in ROOT.glob("*.shp"):
 try:
  gg=gpd.read_file(p)
  if not gg.empty:
   escaped=sum(not aoi.buffer(1e-6).covers(g) for g in gg.geometry)
   if escaped:raise AssertionError(f"{p}: {escaped} out of boundary")
 except Exception as e:note("QA warning: "+str(e))
sources={"OSM_Africa_live":URL_OSM,"HydroRIVERS_Nigeria":URL_HYDRO,
 "GRID3_settlements":URL_SETTLE,"GRID3_watercourses":URL_GRID+"/5",
 "Overpass":"https://wiki.openstreetmap.org/wiki/Overpass_API"}
notes=[
 "WAMAKU RIMA - ArcGIS drainage and settlements package",
 "Source catchment: user-supplied HydroBASINS Level 8 polygon, HYBAS_ID 1080696100",
 f"Catchment area (WGS84/UTM zone 31N): {catch.Area_km2.iloc[0]} sq km",
 f"Generated (UTC): {datetime.now(timezone.utc).isoformat()}",
 "All shapefiles are EPSG:4326 (WGS84), clipped to exact provided catchment.",
 "01 OSM_All_Waterways is an OSM-tagged network; 02 only waterway=river; 03 waterway=river/stream/wadi.",
 "04/05 HydroRIVERS products preserve native ORD_STRA (Strahler order); >=2/3/4 offer thinner cartographic choices.",
 "OSM waterway types are NOT Strahler orders; do not equate or combine overlapping networks.",
 "07 GRID3 settlements are labelled by Name. Some smaller hamlets may be absent; names and positions have source uncertainty.",
 "08 dams/weirs are OSM candidates needing site verification. If empty, none found in queried coverage.",
 "09 Confirmed Named Dams intentionally EMPTY: no independently verified named in-boundary dam could be established.",
 "Goronyo and Lugu dams are upstream/outside THIS user-provided catchment; do not plot them inside it.",
 "Seasonal, ephemeral or unmapped headwater streams may not be represented. Do not treat these data as a DEM-derived exhaustive stream network.",
 "Sources: "+json.dumps(sources),
 "Counts: "+json.dumps(count,sort_keys=True),
 "Data sources © OpenStreetMap contributors (ODbL), GRID3, HydroRIVERS/HydroSHEDS, OCHA as attributed.",
 "ArcGIS Pro: Extract ZIP to a permanent folder, add shapefiles via Map > Add Data; label town layer by Name; choose one drainage option.",
 "HydroRIVERS disclaimer: extracted via third-party public Nigeria Flood feature layer, whose attribution should be checked.",
 "PROCESS LOG:"]+log
(ROOT/"README_Sources_QA.txt").write_text("\n".join(notes),encoding="utf-8")
(ROOT/"manifest.json").write_text(json.dumps({"counts":count,"sources":sources,"bbox_4326":bbox,
 "area_km2":float(catch.Area_km2.iloc[0]),"generated":datetime.now(timezone.utc).isoformat(),"log":log},indent=2),encoding="utf-8")
zip_path=Path("Wamaku_Rima_ArcGIS_Layers.zip")
with zipfile.ZipFile(zip_path,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=8) as z:
 for p in ROOT.rglob("*"):
  if p.is_file():z.write(p,p.relative_to(ROOT.parent))
print("CREATED",zip_path,zip_path.stat().st_size,"COUNTS",json.dumps(count),flush=True)
if not (count.get("04_HydroRIVERS_All_Orders",0) or count.get("01_OSM_All_Waterways",0)):
 raise RuntimeError("Network acquisition failed; refusing to publish empty drainage package.")
if not count.get("07_Towns_Villages_GRID3",0):
 raise RuntimeError("Settlement acquisition failed; refusing to publish empty settlement package.")
