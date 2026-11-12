"""Local browser tests; imagery/terrain mocked. python3 science-viewer/test_viewer.py"""
import base64,importlib.util,io,json,re,tempfile,threading,unittest,sqlite3,struct,zipfile
from pathlib import Path
from http.server import ThreadingHTTPServer
import numpy as np
import tifffile
from PIL import Image
from playwright.sync_api import sync_playwright
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent
spec=importlib.util.spec_from_file_location('science_server',HERE/'serve.py');server_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(server_module)
class Quiet(server_module.Handler):
 def log_message(self,*args):pass
class ScienceViewer(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=ThreadingHTTPServer(('127.0.0.1',0),Quiet);threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.url=f'http://127.0.0.1:{cls.server.server_port}'
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch();cls.tmp=tempfile.TemporaryDirectory()
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close();cls.tmp.cleanup()
 def setUp(self):
  self.ctx=self.browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True);self.addCleanup(self.ctx.close);self.errors=[];self.posts=[]
  def route(r):
   url=r.request.url
   if r.request.method=='POST':self.posts.append(url)
   if 'cdnjs.cloudflare.com/ajax/libs/leaflet/' in url:
    name='leaflet.css' if '.css' in url else 'leaflet.js';return r.fulfill(path=str(ROOT/'node_modules/leaflet/dist'/name),content_type='text/css' if name.endswith('css') else 'text/javascript')
   if 'tiles.mapterhorn.com/' in url:
    out=io.BytesIO();Image.new('RGB',(512,512),(139,184,0)).save(out,format='PNG');return r.fulfill(body=out.getvalue(),content_type='image/png',headers={'Access-Control-Allow-Origin':'*'})
   if url.endswith('/cdse/ping'):return r.fulfill(json={'relay':True,'managed':True})
   if '/cdse/process' in url:
    body=r.request.post_data_json;out=io.BytesIO();Image.new('RGBA',(body['output']['width'],body['output']['height']),(150,170,180,255)).save(out,format='PNG');return r.fulfill(body=out.getvalue(),content_type='image/png')
   if url.startswith(self.url+'/index.html'):
    html=re.sub(r' integrity="[^"]*"','',(ROOT/'index.html').read_text());return r.fulfill(body=html,content_type='text/html')
   if url.startswith(self.url):return r.continue_()
   return r.abort()
  self.ctx.route('**/*',route);self.ctx.add_init_script("localStorage.setItem('tfs-teaser-seen','1');localStorage.setItem('glacierPrefs',JSON.stringify({noTransition:true}));")
  self.page=self.ctx.new_page();self.page.on('pageerror',lambda e:self.errors.append(str(e)));self.page.goto(self.url+'/playground-gabriele');self.f=self.page.frames[1];self.f.wait_for_function("document.querySelector('#scienceStatus')?.textContent.startsWith('Ready')")
 def demo(self):
  self.f.click('#demo');self.f.wait_for_function("document.querySelector('#scienceStatus').textContent.includes('3 local file(s) ready')",timeout=30000)
 def fixture(self,name,value=10,date=None,unit='K',bands=None):
  path=Path(self.tmp.name)/name;xml='<GDALMetadata>'
  if date:xml+=f'<Item name="ACQUISITIONDATETIME" domain="IMAGERY">{date}</Item>'
  if unit:xml+=f'<Item name="UNITTYPE" sample="0" role="unittype">{unit}</Item>'
  xml+='</GDALMetadata>';tags=[(33550,'d',3,(.004,.003,0),False),(33922,'d',6,(0,0,0,7.59,46.02,0),False),(34735,'H',16,(1,1,0,3,1024,0,1,2,1025,0,1,1,2048,0,1,4326),False),(42112,'s',0,xml,False),(306,'s',0,'2026:11:11 12:00:00',False)]
  tifffile.imwrite(path,np.full((16,16),value,dtype=np.float32),tile=(16,16),extratags=tags,metadata=None);return path
 def upload(self,paths):self.f.set_input_files('#file',[str(p) for p in paths]);self.f.wait_for_function(f"document.querySelector('#scienceStatus').textContent.includes('{len(paths)} local file(s) ready')",timeout=30000)
 def clean(self):self.assertFalse(self.errors,self.errors);self.assertTrue(all('/cdse/' in p for p in self.posts),self.posts)
 def test_geojson_polygons_points_attributes_and_last_removal(self):
  path=Path(self.tmp.name)/'survey.geojson';geo={'type':'FeatureCollection','features':[{'type':'Feature','geometry':{'type':'Polygon','coordinates':[[[7.59,45.98],[7.65,45.98],[7.65,46.015],[7.59,46.015],[7.59,45.98]]]},'properties':{'name':'survey outline','date':'2023-08-15','value':4,'unit':'m'}},{'type':'Feature','geometry':{'type':'Point','coordinates':[7.62,46,2400]},'properties':{'name':'stake','date':'2023-08-15','value':7,'unit':'m'}}]};path.write_text(json.dumps(geo));self.upload([path]);self.assertIn('features',self.f.locator('#metadata').text_content());self.assertEqual(self.f.locator('#date').inner_text(),'2023-08-15');self.f.wait_for_function("document.querySelector('#scienceMap').dataset.files")
  self.f.click('#remove');self.f.wait_for_function("document.querySelector('#fileControls').hidden");self.assertEqual(self.f.locator('#datasetList li').count(),0);self.assertTrue(self.f.locator('#scienceMap').is_hidden());self.assertTrue(self.f.locator('#sourceData').is_disabled());self.clean()
 def test_csv_mapping_and_swiss_coordinates(self):
  path=Path(self.tmp.name)/'stakes.csv';path.write_text('east,north,measured,acquired,units\n2625000,1095000,4.5,2023-08-15,m\n2625100,1095100,5.5,2024-08-15,m\n');self.f.set_input_files('#file',str(path));self.f.locator('#importMapping').wait_for(state='visible');self.f.select_option('#mappingCrs','EPSG:2056')
  for field,column in [('mappingX','east'),('mappingY','north'),('mappingValue','measured'),('mappingDate','acquired'),('mappingUnit','units')]:self.f.select_option('#'+field,column)
  self.f.click('#mappingApply');self.f.wait_for_function("document.querySelector('#scienceStatus').textContent.includes('1 local file(s) ready')");self.assertEqual(self.f.locator('#datasetList li').count(),2);self.assertEqual(self.f.locator('#unit').inner_text(),'m');self.assertFalse(self.f.locator('#sourceData').is_disabled());self.clean()
 def test_gpx_kml_and_wkt(self):
  gpx=Path(self.tmp.name)/'track.gpx';gpx.write_text('<gpx version="1.1" creator="test"><wpt lat="46.0" lon="7.62"><name>stake</name><ele>2400</ele><time>2023-08-15T12:00:00Z</time></wpt><trk><trkseg><trkpt lat="46.0" lon="7.61"/><trkpt lat="46.01" lon="7.63"/></trkseg></trk></gpx>');self.upload([gpx]);self.assertGreaterEqual(self.f.locator('#datasetList li').count(),1)
  kml=Path(self.tmp.name)/'area.kml';kml.write_text('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>area</name><Polygon><outerBoundaryIs><LinearRing><coordinates>7.6,46,0 7.64,46,0 7.62,46.01,0 7.6,46,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>');self.upload([kml]);self.assertIn('kml',self.f.locator('#fileName').inner_text());self.clean()
 def test_geopackage_via_local_gdal(self):
  path=Path(self.tmp.name)/'survey.gpkg';db=sqlite3.connect(path);db.executescript("PRAGMA application_id=1196437808; CREATE TABLE gpkg_spatial_ref_sys(srs_name TEXT NOT NULL,srs_id INTEGER PRIMARY KEY,organization TEXT NOT NULL,organization_coordsys_id INTEGER NOT NULL,definition TEXT NOT NULL,description TEXT); CREATE TABLE gpkg_contents(table_name TEXT PRIMARY KEY,data_type TEXT NOT NULL,identifier TEXT,description TEXT,last_change TEXT,min_x DOUBLE,min_y DOUBLE,max_x DOUBLE,max_y DOUBLE,srs_id INTEGER); CREATE TABLE gpkg_geometry_columns(table_name TEXT NOT NULL,column_name TEXT NOT NULL,geometry_type_name TEXT NOT NULL,srs_id INTEGER NOT NULL,z TINYINT NOT NULL,m TINYINT NOT NULL,PRIMARY KEY(table_name,column_name)); CREATE TABLE stakes(fid INTEGER PRIMARY KEY,geom BLOB,name TEXT,value REAL,date TEXT,unit TEXT);")
  from rasterio.crs import CRS
  db.execute('INSERT INTO gpkg_spatial_ref_sys VALUES(?,?,?,?,?,?)',('WGS 84',4326,'EPSG',4326,CRS.from_epsg(4326).to_wkt(),''));db.execute("INSERT INTO gpkg_contents VALUES('stakes','features','stakes','','2023-08-15T00:00:00Z',7.6,46,7.64,46.01,4326)");db.execute("INSERT INTO gpkg_geometry_columns VALUES('stakes','geom','POINT',4326,0,0)");geom=b'GP'+bytes([0,1])+struct.pack('<i',4326)+bytes([1])+struct.pack('<I',1)+struct.pack('<dd',7.62,46.0);db.execute('INSERT INTO stakes VALUES(?,?,?,?,?,?)',(1,geom,'stake',4.5,'2023-08-15','m'));db.commit();db.close();self.f.set_input_files('#file',str(path));self.f.wait_for_function("/local file.s. ready|failed|Error|cannot|undefined/i.test(document.querySelector('#scienceStatus').textContent)",timeout=90000);self.assertIn('1 local file(s) ready',self.f.locator('#scienceStatus').inner_text());self.assertIn('1 features',self.f.locator('#metadata').text_content());self.clean()
 def test_shapefile_zip(self):
  import shapefile
  stem=Path(self.tmp.name)/'outlines'
  with shapefile.Writer(str(stem),shapeType=shapefile.POLYGON) as w:
   w.field('value','N',decimal=2);w.poly([[[7.60,46],[7.60,46.01],[7.64,46.01],[7.64,46],[7.60,46]]]);w.record(4.5)
  from rasterio.crs import CRS
  stem.with_suffix('.prj').write_text(CRS.from_epsg(4326).to_wkt())
  path=stem.with_suffix('.zip')
  with zipfile.ZipFile(path,'w') as z:
   for ext in ['.shp','.dbf','.shx','.prj']:z.write(stem.with_suffix(ext),stem.name+ext)
  self.upload([path]);self.assertIn('features',self.f.locator('#metadata').text_content());self.clean()
 def test_ascii_grid_and_rgb(self):
  path=Path(self.tmp.name)/'thermal.asc';path.write_text('ncols 3\nnrows 2\nxllcorner 7.60\nyllcorner 46.0\ncellsize 0.001\nNODATA_value -9999\n1 2 3\n4 5 6\n');self.f.set_input_files('#file',str(path));self.f.locator('#importMapping').wait_for(state='visible');self.f.select_option('#mappingCrs','EPSG:4326');self.f.click('#mappingApply');self.f.wait_for_function("document.querySelector('#scienceStatus').textContent.includes('1 local file(s) ready')");self.assertIn('GDAL conversion',self.f.locator('#metadata').text_content())
  rgb=Path(self.tmp.name)/'rgb.tif';tags=[(33550,'d',3,(.001,.001,0),False),(33922,'d',6,(0,0,0,7.60,46.01,0),False),(34735,'H',16,(1,1,0,3,1024,0,1,2,1025,0,1,1,2048,0,1,4326),False)];a=np.zeros((16,16,3),dtype=np.uint8);a[:]=[50,100,150];tifffile.imwrite(rgb,a,photometric='rgb',extratags=tags,metadata=None);self.upload([rgb]);self.assertEqual(self.f.locator('#rasterMode').input_value(),'rgb');self.clean()
 def test_classic_netcdf_times(self):
  from scipy.io import netcdf_file
  path=Path(self.tmp.name)/'thermal.nc'
  with netcdf_file(path,'w') as nc:
   for name,count in [('time',2),('lat',2),('lon',3)]:nc.createDimension(name,count)
   lat=nc.createVariable('lat','f8',('lat',));lat[:]=[46,46.001];lon=nc.createVariable('lon','f8',('lon',));lon[:]=[7.60,7.601,7.602];time=nc.createVariable('time','f8',('time',));time[:]=[0,365];time.units='days since 2023-08-15T00:00:00Z';v=nc.createVariable('temperature','f4',('time','lat','lon'));v[:]=np.arange(12).reshape(2,2,3);v.units='K'
  self.upload([path]);self.assertEqual(self.f.locator('#datasetList li').count(),2);self.assertEqual(self.f.locator('#unit').inner_text(),'K');self.assertFalse(self.f.locator('#sourceData').is_disabled());self.clean()
 def test_las_points(self):
  path=Path(self.tmp.name)/'stakes.las';header=bytearray(227);header[:4]=b'LASF';header[24:26]=bytes([1,2]);struct.pack_into('<H',header,94,227);struct.pack_into('<I',header,96,227);header[104]=0;struct.pack_into('<H',header,105,20);struct.pack_into('<I',header,107,2)
  for offset in [131,139,147]:struct.pack_into('<d',header,offset,.001)
  points=b''.join(struct.pack('<iiiHBBbBH',x,y,z,100,1,2,0,0,0) for x,y,z in [(7620,46000,2400000),(7630,46010,2401000)]);path.write_bytes(header+points);self.f.set_input_files('#file',str(path));self.f.locator('#importMapping').wait_for(state='visible');self.f.select_option('#mappingCrs','EPSG:4326');self.f.click('#mappingApply');self.f.wait_for_function("document.querySelector('#scienceStatus').textContent.includes('1 local file(s) ready')");self.assertIn('2 features',self.f.locator('#metadata').text_content());self.clean()
 def test_zmutt_playground_is_separate(self):
  self.assertTrue(self.page.url.endswith('/playground-gabriele'));self.assertTrue(self.f.locator('#glacierList').is_hidden());self.assertTrue(self.f.locator('#mGlacier').is_hidden());self.assertIn('Zmutt Glacier',self.f.locator('#glacierGroup .step-h').inner_text());self.assertIn('Open local field data',self.f.locator('#scienceStatus').inner_text());self.assertEqual(self.f.evaluate("import('./js/02-glaciers.js').then(m=>m.GLACIERS.map(g=>g.id))"),['zmutt'])
  original=self.ctx.new_page();original.goto(self.url+'/index.html#g=zmutt');original.wait_for_selector('#glacierList li');self.assertGreater(original.locator('#glacierList li').count(),1);self.assertEqual(original.locator('#openFiles').count(),0);original.close();self.clean()
 def test_actual_explorer_style_and_features(self):
  self.assertEqual(self.f.locator('aside.controls').count(),1);self.assertTrue(self.f.locator('#modeCompare').is_visible());self.assertTrue(self.f.locator('#modeTimelapse').is_visible())
  self.assertEqual(self.f.locator('link[href="css/style.css"]').count(),1);self.assertTrue(self.f.locator('#shareGroup').count());self.assertTrue(self.f.locator('#layerbox').count())
  self.assertEqual(self.f.evaluate("getComputedStyle(document.body).fontFamily"),self.f.evaluate("getComputedStyle(document.querySelector('.mapbar')).fontFamily"));self.clean()
 def test_multiple_files_same_year_slider_and_pixels(self):
  a=self.fixture('morning.tif',10,'2023-08-15T08:00:00Z');b=self.fixture('afternoon.tif',20,'2023-08-15T15:00:00Z');self.upload([b,a]);self.f.click('#modeCompare')
  self.f.wait_for_function("document.querySelectorAll('#dataDatesA button').length===2")
  self.assertEqual(self.f.locator('#dataDatesA button').first.inner_text(),'2023-08-15T08:00:00Z')
  self.f.wait_for_function("document.querySelector('#scienceMap').dataset.files?.split(',').length===2")
  colours=self.f.evaluate("()=>{const c=document.querySelector('#scienceMap'),x=c.getContext('2d'),p=(a,b)=>Array.from(x.getImageData(Math.round(c.width*a),Math.round(c.height*b),1,1).data);return [p(.25,.5),p(.75,.5)];}")
  # Same-year observations retain separate file identities, even on identical background imagery.
  self.assertNotEqual(self.f.locator('#scienceMap').get_attribute('data-files').split(',')[0],self.f.locator('#scienceMap').get_attribute('data-files').split(',')[1])
  values=self.f.evaluate("""async payload=>{const w=new Worker('/science-viewer/dist/raster-worker.js',{type:'module'});let n=0;const ask=(type,data)=>new Promise((resolve,reject)=>{w.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.result);w.postMessage({id:++n,type,...data});});try{for(let i=0;i<2;i++){const bytes=Uint8Array.from(atob(payload[i]),c=>c.charCodeAt(0));await ask('open',{datasetId:'file'+i,file:new File([bytes],'fixture.tif')});}const p=L.CRS.EPSG3857.project(L.latLng(46,7.60)),xy=[p.x,p.y],a=await ask('inspect',{datasetId:'file0',xy}),b=await ask('inspect',{datasetId:'file1',xy}),again=await ask('inspect',{datasetId:'file0',xy});return[a.value,b.value,again.value];}finally{w.terminate();}}""",[base64.b64encode(a.read_bytes()).decode(),base64.b64encode(b.read_bytes()).decode()]);self.assertEqual(values,[10,20,10]);self.clean()

 def test_timelapse_play_pause_scrub_and_native_slider(self):
  self.demo();self.f.click('#modeTimelapse');self.f.wait_for_function("document.querySelector('.science-timeline')")
  first=self.f.locator('#scienceData').get_attribute('data-frame');self.f.check('#loopToggle');self.f.locator('#speedSel').fill('3');self.f.click('#playBtn');self.f.wait_for_function("document.querySelector('#scienceData').dataset.playing==='true'")
  self.f.wait_for_function("id=>document.querySelector('#scienceData').dataset.frame!==id",arg=first,timeout=15000)
  self.f.click('#playBtn');self.f.wait_for_function("document.querySelector('#scienceData').dataset.playing==='false'")
  self.f.locator('#frameSlider').fill('2');self.f.locator('#frameSlider').dispatch_event('input');self.f.wait_for_function("document.querySelector('#date').textContent==='2024-08-15'")
  self.f.click('#modeCompare');self.f.locator('#dataDatesA').wait_for(state='visible');self.clean()
 def test_unknown_units_and_dates_not_invented(self):
  a=self.fixture('undated.tif',10,None,None);self.upload([a]);self.assertEqual(self.f.locator('#date').inner_text(),'Not recorded in file');self.assertEqual(self.f.locator('#unit').inner_text(),'Not recorded in file');self.assertTrue(self.f.locator('#sourceData').is_disabled());self.assertEqual(self.f.locator('input#date,input#unit').count(),0);self.clean()
 def test_incompatible_units_not_played_as_one_series(self):
  a=self.fixture('kelvin.tif',10,'2023-08-15','K');b=self.fixture('celsius.tif',20,'2024-08-15','degC');self.upload([a,b]);self.assertTrue(self.f.locator('#sourceData').is_disabled());self.assertEqual(self.f.locator('#datasetList li').count(),2);self.clean()
 def test_yearly_3d_and_full_fixed_3d_with_comparison(self):
  self.demo();self.f.click('#modeCompare');self.f.click('#view3dBtn');self.f.wait_for_function("import('./js/11-view3d.js').then(m=>!!m.v3dCtx)",timeout=30000);self.f.wait_for_timeout(700)
  self.assertEqual(self.f.locator('#v3d').is_visible(),True);self.f.click('#viewFull');self.f.wait_for_function("document.querySelector('#fullPanel').dataset.state==='ready'",timeout=30000)
  self.f.wait_for_function("document.querySelector('#fullPanel').dataset.textureYear?.includes(',')",timeout=30000);self.assertEqual(self.f.locator('#fullPanel').get_attribute('data-reference-year'),'2023');self.f.wait_for_function("document.querySelector('#fullPanel').dataset.overlaySources?.split(',').length===2 && !document.querySelector('#fullPanel').dataset.overlaySources.includes('none')")
  self.f.click('#viewMap');self.assertTrue(self.f.locator('#fullPanel').is_hidden());self.clean()
 def test_settings_and_removal(self):
  self.demo()
  with self.page.expect_download() as dl:self.f.click('#save')
  data=json.loads(Path(dl.value.path()).read_text());self.assertEqual(len(data['files']),3);self.assertNotIn('date',data['display']);self.assertNotIn('unit',data['display'])
  self.f.click('#remove');self.f.wait_for_function("document.querySelectorAll('#datasetList li').length===2");self.clean()
 def test_temporal_bands_in_one_file(self):
  path=Path(self.tmp.name)/'temporal-bands.tif';xml='<GDALMetadata><Item name="ACQUISITION_DATE" sample="0">2023-08-15</Item><Item name="ACQUISITION_DATE" sample="1">2023-09-15</Item><Item name="UNITTYPE" sample="0" role="unittype">K</Item><Item name="UNITTYPE" sample="1" role="unittype">K</Item></GDALMetadata>'
  tags=[(33550,'d',3,(.004,.003,0),False),(33922,'d',6,(0,0,0,7.59,46.02,0),False),(34735,'H',16,(1,1,0,3,1024,0,1,2,1025,0,1,1,2048,0,1,4326),False),(42112,'s',0,xml,False)]
  tifffile.imwrite(path,np.full((16,16,2),15,dtype=np.float32),photometric='minisblack',planarconfig='contig',tile=(16,16),extratags=tags,metadata=None);self.upload([path])
  self.assertEqual(self.f.locator('#datasetList li').count(),2);self.assertFalse(self.f.locator('#sourceData').is_disabled());self.f.select_option('#band','1');self.assertEqual(self.f.locator('#date').inner_text(),'2023-09-15');self.assertEqual(self.f.locator('#unit').inner_text(),'K');self.clean()
 def test_same_date_bands_are_channels_not_extra_dates(self):
  paths=[]
  for n,date in enumerate(['2023-08-15','2024-08-15']):
   path=Path(self.tmp.name)/f'channels-{n}.tif';xml=f'<GDALMetadata><Item name="ACQUISITION_DATE">{date}</Item><Item name="UNITTYPE" sample="0" role="unittype">K</Item><Item name="UNITTYPE" sample="1" role="unittype">K</Item></GDALMetadata>'
   tags=[(33550,'d',3,(.004,.003,0),False),(33922,'d',6,(0,0,0,7.59,46.02,0),False),(34735,'H',16,(1,1,0,3,1024,0,1,2,1025,0,1,1,2048,0,1,4326),False),(42112,'s',0,xml,False)]
   tifffile.imwrite(path,np.full((16,16,2),15,dtype=np.float32),photometric='minisblack',planarconfig='contig',tile=(16,16),extratags=tags,metadata=None);paths.append(path)
  self.upload(paths);self.assertEqual(self.f.locator('#datasetList li').count(),4);self.assertEqual(self.f.locator('#dataDatesOne button').count(),2);self.clean()
 def test_large_bigtiff_budget_and_frame_cache(self):
  path=Path(self.tmp.name)/'large-thermal.tif';tags=[(33550,'d',3,(.064/65536,.048/81920,0),False),(33922,'d',6,(0,0,0,7.59,46.02,0),False),(34735,'H',16,(1,1,0,3,1024,0,1,2,1025,0,1,1,2048,0,1,4326),False)]
  tifffile.imwrite(path,data=None,shape=(81920,65536),dtype='uint8',bigtiff=True,rowsperstrip=81920,extratags=tags,metadata=None);self.assertGreater(path.stat().st_size,5_000_000_000);self.upload([path]);self.assertIn('too much raster decoding',self.f.locator('#scienceStatus').inner_text());self.f.click('#remove');path.unlink()
  result=self.f.evaluate("""async()=>{const{FrameCache}=await import('/science-viewer/series.js'),c=new FrameCache(4);for(let i=0;i<100;i++)c.set(i,new Uint8Array(1024));return{size:c.items.size,old:c.get(0),last:!!c.get(99)};}""");self.assertEqual(result,{'size':4,'old':None,'last':True});self.clean()
 def test_restored_settings_cannot_override_metadata(self):
  self.demo()
  with self.page.expect_download() as dl:self.f.click('#save')
  settings=json.loads(Path(dl.value.path()).read_text());settings['display'].update({'date':'1900-01-01','unit':'invented'});path=Path(self.tmp.name)/'tampered.json';path.write_text(json.dumps(settings));self.f.set_input_files('#restore',str(path));self.f.wait_for_function("document.querySelector('#scienceStatus').textContent.startsWith('Display settings restored')");self.assertEqual(self.f.locator('#date').inner_text(),'2022-08-15');self.assertEqual(self.f.locator('#unit').inner_text(),'°C');self.clean()
 def test_desktop_phone_layout(self):
  self.demo();self.f.click('#modeTimelapse');self.f.locator('#modeTimelapse').scroll_into_view_if_needed();self.page.screenshot(path='/tmp/science-native-desktop.png');self.page.set_viewport_size({'width':390,'height':844});self.page.wait_for_timeout(500);self.page.screenshot(path='/tmp/science-native-phone.png',full_page=True);self.assertLessEqual(self.f.evaluate('document.documentElement.scrollWidth'),390);self.clean()
if __name__=='__main__':unittest.main(verbosity=2)
