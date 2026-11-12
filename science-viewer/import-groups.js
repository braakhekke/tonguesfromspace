/* Keep multi-file datasets together, independently of selection order. */
export function groupImports(files){
 const out=[],used=new Set(),ext=f=>f.name.toLowerCase().split('.').at(-1),stem=f=>f.name.slice(0,f.name.lastIndexOf('.')).toLowerCase();
 const common=['dbf','shx','prj','cpg','tfw','jgw','pgw','wld','hdr'];
 const extra={tab:['map','dat','id'],mif:['mid'],sdat:['sgrd'],img:['ige']};
 const isSide=(primary,file)=>stem(primary)===stem(file)&&(common.includes(ext(file))||(extra[ext(primary)]||[]).includes(ext(file)));
 for(const file of files){if(used.has(file))continue;if(files.some(p=>p!==file&&isSide(p,file)&&!isSide(file,p)))continue;const companions=files.filter(p=>p!==file&&isSide(file,p));used.add(file);companions.forEach(p=>used.add(p));out.push({file,companions});}
 return out;
}
