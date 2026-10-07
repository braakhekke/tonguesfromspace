import sys,json,re,datetime
sys.path.insert(0,'/private/tmp/claude-588421604/-Users-jbraak-TSF-project-tonguesfromspace/eba2890e-3d67-49c4-8ece-4775a84c37aa/scratchpad/ice')
from lib import *
SP='/private/tmp/claude-588421604/-Users-jbraak-TSF-project-tonguesfromspace/eba2890e-3d67-49c4-8ece-4775a84c37aa/scratchpad/ice/'
j=load(); gi=int(sys.argv[1]); yr=int(sys.argv[2]); thr=float(sys.argv[3]) if len(sys.argv)>3 else 0.45
g=j['glaciers'][gi]; bb,w,h,scale=footprint(g); print(g['name'],bb,w,h)
html=open(ROOT+'/index.html',encoding='utf-8').read()
ev=re.search(r'const SCENE_EVALSCRIPT = `(.*?)`;',html,re.S).group(1)
res=round(60*scale)
body={"input":{"bounds":{"bbox":bb,"properties":{"crs":"http://www.opengis.net/def/crs/EPSG/0/3857"}},"data":[{"type":"sentinel-2-l2a","dataFilter":{"mosaickingOrder":"leastCC"}}]},
 "aggregation":{"timeRange":{"from":f"{yr}-07-01T00:00:00Z","to":f"{yr}-09-21T00:00:00Z"},"aggregationInterval":{"of":"P1D"},"evalscript":ev,"resx":res,"resy":res}}
r=json.loads(post('statistics',body,'application/json'))
days=[]
for d in r['data']:
    try:
        c=d['outputs']['cloud']['bands']['B0']['stats']; sn=d['outputs']['snow']['bands']['B0']['stats']
        days.append((d['interval']['from'][:10],c['mean'],sn['mean'],1-c['noDataCount']/c['sampleCount']))
    except Exception: pass
days=[d for d in days if d[0][5:]<='09-20' and d[3]>=.95]
sep=[d for d in days if d[0][5:7]=='09' and d[1]<=.05]
best=(sys.argv[4],0,0,1); print('scene',best)
ES='''//VERSION=3
function setup(){return{input:[{bands:["B03","B04","B08","B11","SCL","dataMask"]}],output:{bands:1,sampleType:"UINT8"}};}
function evaluatePixel(s){
 if(s.dataMask==0||s.SCL==0)return[0];
 if(s.SCL==3||s.SCL==8||s.SCL==9||s.SCL==10)return[240];
 var n=(s.B03-s.B11)/(s.B03+s.B11);
 if(n>%s&&s.B08>%s)return[s.B04>%s?180:120];
 return[60];
}'''%(sys.argv[5],sys.argv[6],thr)
print(len(ES))
body={"input":{"bounds":{"bbox":bb,"properties":{"crs":"http://www.opengis.net/def/crs/EPSG/0/3857"}},"data":[{"type":"sentinel-2-l2a","dataFilter":{"timeRange":{"from":best[0]+"T00:00:00Z","to":best[0]+"T23:59:59Z"}}}]},
 "output":{"width":w,"height":h,"responses":[{"identifier":"default","format":{"type":"image/png"}}]},"evalscript":ES}
png=post('process',body,'image/png')
open(SP+f'mask_{gi}_{yr}.jpg','wb').write(png)
import subprocess; subprocess.run(['sips','-s','format','png',SP+f'mask_{gi}_{yr}.jpg','--out',SP+f'mask_{gi}_{yr}.png'],capture_output=True)
W,H,ch,rows=read_png(open(SP+f'mask_{gi}_{yr}.png','rb').read()); print(W,H,ch)
pal={0:(0,0,0),1:(70,70,70),2:(60,200,255),3:(255,255,255),4:(230,60,200)}
q=lambda v: min(4,int(round(v/60)))
out=[]; cnt={}
for row in rows:
    o=bytearray()
    for v in row[::ch]:
        v=q(v); o+=bytes(pal[v]); cnt[v]=cnt.get(v,0)+1
    out.append(o)
print(cnt)
write_png(SP+f'view_{gi}_{yr}.png',W,H,out)

# crop around the tongue tip with the SGI2023 outline drawn in red
tip=g['terminus']['tip']; mx,my=merc(*tip)
cx=int((mx-bb[0])/(bb[2]-bb[0])*W); cy=int((bb[3]-my)/(bb[3]-bb[1])*H)
grid=[[q(v) for v in row[::ch]] for row in rows]
def px(lng,lat):
    x,y=merc(lat,lng); return ((x-bb[0])/(bb[2]-bb[0])*W,(bb[3]-y)/(bb[3]-bb[1])*H)
edge=set()
for poly in g['outline']['coordinates']:
    for ring in poly:
        pts=[px(*p) for p in ring]
        for a,b2 in zip(pts,pts[1:]):
            n=max(1,int(max(abs(a[0]-b2[0]),abs(a[1]-b2[1]))))
            for k in range(n+1):
                edge.add((int(a[0]+(b2[0]-a[0])*k/n),int(a[1]+(b2[1]-a[1])*k/n)))
S=int(sys.argv[7]) if len(sys.argv)>7 else 300
out=[]
for y in range(max(0,cy-S),min(H,cy+S)):
    o=bytearray()
    for x in range(max(0,cx-S),min(W,cx+S)):
        o+=bytes((255,0,0) if (x,y) in edge else pal[grid[y][x]])
    out.append(o)
write_png(SP+f'crop_{gi}_{yr}.png',min(W,cx+S)-max(0,cx-S),len(out),out)
