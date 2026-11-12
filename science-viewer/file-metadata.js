/* Only explicitly named acquisition fields are used. TIFF DateTime and filesystem
   timestamps describe files, not necessarily the acquisition (GDAL raster data model). */
const dateKeys=['ACQUISITIONDATETIME','ACQUISITION_DATE','DATE_ACQUIRED','SENSING_TIME'];
function entries(md={}){return Object.fromEntries(Object.entries(md||{}).filter(([,v])=>typeof v==='string'||typeof v==='number').map(([k,v])=>[k.toUpperCase(),String(v).trim()]));}
function field(md,keys){for(const key of keys)if(md[key])return {value:md[key],source:key};return null;}
function acquisition(md){
 const found=dateKeys.filter(k=>md[k]).map(k=>({value:md[k],source:k}));
 if(!found.length)return {value:null,year:null,source:null};
 const values=[...new Set(found.map(x=>x.value))];
 const days=[...new Set(values.map(v=>/^\d{4}[-:]\d{2}[-:]\d{2}/.test(v)?v.slice(0,10).replaceAll(':','-'):v))];
 if(days.length>1)return {value:null,year:null,source:'Conflicting acquisition fields',conflicts:found};
 const value=found[0].value,match=/^(\d{4})[-:](\d{2})[-:](\d{2})(?:$|[T ])/.exec(value);
 let year=null;if(match){const y=+match[1],m=+match[2],d=+match[3],date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d)year=y;}
 return {...found[0],year};
}
export function fileMetadata(dataset,bandMetadata){
 const root=entries(dataset),datasetDate=acquisition(root);
 return bandMetadata.map(md=>{
  const band=entries(md),ownDate=acquisition(band),date=ownDate.value||ownDate.conflicts?ownDate:datasetDate;
  const unit=field(band,['UNITTYPE','UNITS','UNIT'])||field(root,['UNITTYPE','UNITS','UNIT']);
  const scale=field(band,['SCALE']),offset=field(band,['OFFSET']);
  // We display stored pixels. A physical unit attached to scaled pixels must not
  // silently become the unit of those stored values.
  const needsScaling=!!((scale&&Number(scale.value)!==1)||(offset&&Number(offset.value)!==0));
  return {acquisition:date,unit:unit?.value||null,unitSource:unit?.source||null,description:field(band,['DESCRIPTION','LONG_NAME'])?.value||null,scale:scale?.value||null,offset:offset?.value||null,needsScaling,displayUnit:needsScaling?null:unit?.value||null};
 });
}
