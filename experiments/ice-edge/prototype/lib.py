import json,math,re,urllib.request,zlib,struct,os
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
RELAY="https://tonguesfromspace-relay.jjm-braakhekke.workers.dev/cdse/"
ROOT='/Users/jbraak/TSF_project/tonguesfromspace'
def load():
    s=open(ROOT+'/glaciers.js').read(); return json.loads(s[s.index('{'):s.rindex('}')+1])
def pad(b,f):
    dy=(b[1][0]-b[0][0])*f; dx=(b[1][1]-b[0][1])*f
    return [[b[0][0]-dy,b[0][1]-dx],[b[1][0]+dy,b[1][1]+dx]]
def merc(lat,lng):
    R=6378137; return (R*math.radians(lng), R*math.log(math.tan(math.pi/4+math.radians(lat)/2)))
def footprint(g,north=0):
    (s0,w0),(n0,e0)=g['bbox']; b=pad(pad([[s0,w0],[n0,e0]],0.08),0.35)
    sw=merc(*b[0]); ne=merc(*b[1]); bb=[round(sw[0]),round(sw[1]),round(ne[0]),round(ne[1])]
    lat=(b[0][0]+b[1][0])/2; scale=1/math.cos(math.radians(lat))
    w=round((bb[2]-bb[0])/(10*scale)); h=round((bb[3]-bb[1])/(10*scale)); k=min(1,2500/max(w,h)); return bb,round(w*k),round(h*k),scale
def post(route,body,accept):
    req=urllib.request.Request(RELAY+route,data=json.dumps(body).encode(),headers={"Content-Type":"application/json","Accept":accept,"Origin":"http://localhost:8000","User-Agent":UA})
    return urllib.request.urlopen(req,timeout=300).read()
def read_png(data):
    assert data[:8]==b'\x89PNG\r\n\x1a\n'; i=8; idat=b''; 
    while i<len(data):
        n,=struct.unpack('>I',data[i:i+4]); t=data[i+4:i+8]; c=data[i+8:i+8+n]; i+=12+n
        if t==b'IHDR': w,h,bd,ct,_,_,il=struct.unpack('>IIBBBBB',c)
        elif t==b'IDAT': idat+=c
    assert bd==8 and il==0, (bd,il)
    ch={0:1,2:3,4:2,6:4}[ct]; raw=zlib.decompress(idat); stride=w*ch; rows=[]; prev=bytearray(stride); p=0
    for y in range(h):
        f=raw[p]; line=bytearray(raw[p+1:p+1+stride]); p+=1+stride
        for x in range(stride):
            a=line[x-ch] if x>=ch else 0; b=prev[x]; c2=prev[x-ch] if x>=ch else 0
            if f==1: line[x]=(line[x]+a)&255
            elif f==2: line[x]=(line[x]+b)&255
            elif f==3: line[x]=(line[x]+((a+b)>>1))&255
            elif f==4:
                pa=abs(b-c2); pb=abs(a-c2); pc=abs(a+b-2*c2)
                pr=a if pa<=pb and pa<=pc else (b if pb<=pc else c2); line[x]=(line[x]+pr)&255
        rows.append(line); prev=line
    return w,h,ch,rows
def write_png(path,w,h,rgb_rows):
    raw=b''.join(b'\x00'+bytes(r) for r in rgb_rows)
    def chunk(t,d): c=struct.pack('>I',len(d))+t+d; return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    open(path,'wb').write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))
