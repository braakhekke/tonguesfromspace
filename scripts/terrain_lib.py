"""What every terrain builder shares, for every region alike: the glacier records (data/boxes.js, generated from data/regions/), the writer of data/terrain/<id>.<hash>.bin with its manifest,
and the check that a written file holds the strip of its record. The sources differ by region (build_terrain_bundle.py: swissALTI3D; build_dem_arctic.py: dated ArcticDEM strips); this is not."""
import datetime, hashlib, json, math, os, struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'terrain')
R = 6378137.0


def merc(lat, lon): return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def unmerc(x, y): return math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2), math.degrees(x / R)


def records():
    """{id: record} of data/boxes.js: name, region, tip, strip3d {azimuth, half, back, up}, ..."""
    t = open(os.path.join(ROOT, 'data', 'boxes.js'), encoding='utf-8').read()
    return json.loads(t[t.index('{', t.index('window.GLACIER_BOXES')):t.rindex('}') + 1])['glaciers']


def manifest():
    p = os.path.join(OUT, 'manifest.json')
    return json.load(open(p)) if os.path.exists(p) else {}


def missing():
    """ids of records that should have a terrain file and have none (sub-outlets are records only)"""
    man = manifest()
    return [i for i, r in records().items() if not r.get('parent') and (i not in man or not os.path.exists(os.path.join(OUT, man[i])))]


def _sub_layers(head, count):
    """layers stored as the difference to layer 0 (the heights): the year surfaces and the bed; not the ice change (head.dem) and not the lake flags"""
    first = 1 + (1 if head.get('dem') else 0); ny = len((head.get('yearly') or {}).get('years', [])) if head.get('yearly') else 0
    return list(range(first, first + ny + (1 if head.get('bed') else 0)))


def pack(head, payload):
    """legacy payload (zlib of int16 layers, rows as differences) -> compact payload (head['enc'] = 2): the surfaces and the bed as difference to the heights, low bytes then high bytes, zlib. Lossless."""
    import numpy as np, zlib
    a = np.frombuffer(zlib.decompress(payload), '<i2').copy(); n = (head['nA'] + 1) * (head['nB'] + 1); L = a.reshape(-1, n)
    for k in _sub_layers(head, len(L)):
        if k < len(L): L[k] = (L[k].astype(np.int32) - L[0]).astype('<i2')
    u = L.ravel().view(np.uint8); head['enc'] = 2
    return zlib.compress(np.concatenate([u[0::2], u[1::2]]).tobytes(), 9)


def unpack(head, payload):
    """compact payload -> legacy payload (what every reader below expects); a legacy file passes through"""
    import numpy as np, zlib
    if head.get('enc') != 2: return payload
    b = np.frombuffer(zlib.decompress(payload), np.uint8); h = len(b) // 2; a = np.empty(len(b), np.uint8); a[0::2] = b[:h]; a[1::2] = b[h:]
    L = a.view('<i2').reshape(-1, (head['nA'] + 1) * (head['nB'] + 1)).copy()
    for k in _sub_layers(head, len(L)):
        if k < len(L): L[k] = (L[k].astype(np.int32) + L[0]).astype('<i2')
    return zlib.compress(L.tobytes(), 1)


def write_bundle(gid, head, payload):
    """TFS1 + header length + header (JSON) + payload; the name carries the hash of the content; older files of the glacier go; the manifest names the new one.
    The caller passes the legacy payload (zlib of int16 layers); it is stored compact (pack)."""
    head = {k: v for k, v in head.items() if k != 'enc'}; payload = pack(head, payload)
    hb = json.dumps(head, separators=(',', ':')).encode(); data = b'TFS1' + struct.pack('<I', len(hb)) + hb + payload
    name = f'{gid}.{hashlib.sha1(data).hexdigest()[:8]}.bin'; os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith(gid + '.') and f.endswith('.bin') and f != name: os.remove(os.path.join(OUT, f))
    open(os.path.join(OUT, name), 'wb').write(data)
    man = manifest(); man[gid] = name; json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1, sort_keys=True)
    return name, len(data)


def header(name):
    with open(os.path.join(OUT, name), 'rb') as f: raw = f.read(8); return json.loads(f.read(struct.unpack('<I', raw[4:8])[0]))


def strip_problems(gid, h=None):
    """how the file of a glacier differs from the strip of its record (empty list = equal); the same rule as tests/test_boxes.py"""
    r = records()[gid]; h = h or header(manifest()[gid]); px, py = merc(*r['tip']); t = r['strip3d']; az = math.radians(t['azimuth']); out = []; sh = t.get('shift', 0); k0 = 1 / math.cos(math.radians(r['tip'][0])); px, py = px + sh * math.cos(az) * k0, py - sh * math.sin(az) * k0
    for what, a, b, tol in (('P.x', h['P'][0], px, 1e-3), ('P.y', h['P'][1], py, 1e-3), ('k', h['k'], 1 / math.cos(math.radians(r['tip'][0])), 1e-9), ('ue', h['ue'], math.sin(az), 1e-9),
                            ('un', h['un'], math.cos(az), 1e-9), ('up', h['up'], t['up'], 1e-6), ('back', h['back'], t['back'], 0), ('half', h.get('half', 2000), t['half'], 0)):
        if abs(a - b) > tol: out.append(f'{what}: file {a}, record {b}')
    return out


def read(name):
    """(header, payload) of a file; the payload is the zlib stream"""
    d = open(os.path.join(OUT, name), 'rb').read(); n = struct.unpack('<I', d[4:8])[0]; head = json.loads(d[8:8 + n])
    return head, unpack(head, d[8 + n:])


def base_heights(head, payload):
    """the heights (m above the tip's reference) of the base surface as rows from far up the glacier to below the tip, columns left to right"""
    import zlib
    nA, nB = head['nA'], head['nB']; w = nB + 1; flat = struct.unpack('<%dh' % ((nA + 1) * w), zlib.decompress(payload)[:(nA + 1) * w * 2]); rows = []
    for j in range(nA + 1):
        acc, row = 0, []
        for v in flat[j * w:(j + 1) * w]: acc += v; row.append(acc / 10)
        rows.append(row)
    return rows
