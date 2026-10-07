import sys,json,re,subprocess
sys.path.insert(0,'/private/tmp/claude-588421604/-Users-jbraak-TSF-project-tonguesfromspace/eba2890e-3d67-49c4-8ece-4775a84c37aa/scratchpad/ice')
from lib import *
SP='/private/tmp/claude-588421604/-Users-jbraak-TSF-project-tonguesfromspace/eba2890e-3d67-49c4-8ece-4775a84c37aa/scratchpad/ice/'
j=load()
html=open(ROOT+'/index.html',encoding='utf-8').read()
stat_es=re.search(r'const SCENE_EVALSCRIPT = `(.*?)`;',html,re.S).group(1)
def best_day(g,bb,scale,yr):
    res=round(60*scale)
    body={"input":{"bounds":{"bbox":bb,"properties":{"crs":"http://www.opengis.net/def/crs/EPSG/0/3857"}},"data":[{"type":"sentinel-2-l2a","dataFilter":{"mosaickingOrder":"leastCC"}}]},
     "aggregation":{"timeRange":{"from":f"{yr}-07-01T00:00:00Z","to":f"{yr}-09-21T00:00:00Z"},"aggregationInterval":{"of":"P1D"},"evalscript":stat_es,"resx":res,"resy":res}}
    r=json.loads(post('statistics',body,'application/json')); days=[]
    for d in r['data']:
        try:
            c=d['outputs']['cloud']['bands']['B0']['stats']; sn=d['outputs']['snow']['bands']['B0']['stats']
            days.append((d['interval']['from'][:10],c['mean'],sn['mean'],1-c['noDataCount']/c['sampleCount']))
        except Exception: pass
    days=[d for d in days if d[0][5:]<='09-20' and d[3]>=.95]
    sep=[d for d in days if d[0][5:7]=='09' and d[1]<=.05]
    return sorted(sep or days,key=lambda d:(d[2],d[1]))[0][0]
def mask(g,bb,w,h,day,nd,nir,red=0.45):
    ES='''//VERSION=3
function setup(){return{input:[{bands:["B03","B04","B08","B11","SCL","dataMask"]}],output:{bands:1,sampleType:"UINT8"}};}
function evaluatePixel(s){
 if(s.dataMask==0||s.SCL==0)return[0];
 if(s.SCL==3||s.SCL==8||s.SCL==9||s.SCL==10)return[240];
 var n=(s.B03-s.B11)/(s.B03+s.B11);
 if(n>%s&&s.B08>%s)return[s.B04>%s?180:120];
 return[60];
}'''%(nd,nir,red)
    body={"input":{"bounds":{"bbox":bb,"properties":{"crs":"http://www.opengis.net/def/crs/EPSG/0/3857"}},"data":[{"type":"sentinel-2-l2a","dataFilter":{"timeRange":{"from":day+"T00:00:00Z","to":day+"T23:59:59Z"}}}]},
     "output":{"width":w,"height":h,"responses":[{"identifier":"default","format":{"type":"image/png"}}]},"evalscript":ES}
    open(SP+'tmp.jpg','wb').write(post('process',body,'image/png'))
    subprocess.run(['sips','-s','format','png',SP+'tmp.jpg','--out',SP+'tmp.png'],capture_output=True)
    W,H,ch,rows=read_png(open(SP+'tmp.png','rb').read()); return [bytes(r[::ch]) for r in rows]
def raster(g,bb,w,h):
    cols=[[] for _ in range(h)]
    for poly in g['outline']['coordinates']:
        for ring in poly:
            pts=[]
            for lng,lat in ring:
                x,y=merc(lat,lng); pts.append(((x-bb[0])/(bb[2]-bb[0])*w,(bb[3]-y)/(bb[3]-bb[1])*h))
            for (x0,y0),(x1,y1) in zip(pts,pts[1:]+pts[:1]):
                if y0==y1: continue
                if y0>y1: x0,y0,x1,y1=x1,y1,x0,y0
                for r in range(max(0,int(y0+.5)),min(h,int(y1+.5))):
                    cols[r].append(x0+(x1-x0)*((r+.5)-y0)/(y1-y0))
    m=[]
    for r in range(h):
        xs=sorted(cols[r]); row=bytearray(w)
        for a,b in zip(xs[::2],xs[1::2]):
            for x in range(max(0,int(a+.5)),min(w,int(b+.5))): row[x]=1
        m.append(row)
    return m
variants=[(0.4,0.11)]
print('glacier | scene | polygon px | strict: ice+snow in polygon %, bare ice % | loose: same')
for gi,g in list(enumerate(j['glaciers']))[4:]:
    bb,w,h,scale=footprint(g); day=best_day(g,bb,scale,2023); poly=raster(g,bb,w,h); A=sum(sum(r) for r in poly); out=[]
    for nd,nir in variants:
        rows=mask(g,bb,w,h,day,nd,nir)
        ice=snow=0
        for y in range(h):
            pr=poly[y]; mr=rows[y]
            for x in range(w):
                if pr[x]:
                    c=round(mr[x]/60)
                    if c==2: ice+=1
                    elif c==3: snow+=1
        out.append(f"{100*(ice+snow)/A:5.1f} % / ice {100*ice/A:5.1f} %")
    print(f"{g['name'][:24]:24} {day} {A:7d} | strict {out[0]}",flush=True)
