import {cp,mkdir,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {buildOffline} from './offline/build.mjs';
const target='.offline-public';await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
await cp('.next/static',target+'/offline-assets/_next/static',{recursive:true});
await mkdir('public',{recursive:true});
try{await cp('.next/server/app/icon.svg.body',target+'/icon.svg');}catch{}
for(const e of await readdir('public',{withFileTypes:true})){if(e.name.startsWith('offline-')||e.name==='offline.css'||e.name==='index.html'||e.name==='sw.js')continue;await cp('public/'+e.name,target+'/'+e.name,{recursive:true});}
await cp('.next/server/app/offline.html',target+'/index.html');
async function isolateAssets(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await isolateAssets(file);else if(/\.(?:html|js|css|json)$/.test(entry.name)){const text=await readFile(file,'utf8');await writeFile(file,text.replaceAll('/_next/','/offline-assets/_next/'));}}}
await isolateAssets(target);

const report=await buildOffline({directory:target,name:"Orbit Task Manager",limits:'Complete local task, project, goal, board, timer and report tools save on this device. The browser-only workspace stays separate from account records. Account sign-in, cloud sync, file uploads and cloud attachments require internet.'});
for(const e of await readdir(target)){if(e==='_next')continue;await cp(target+'/'+e,'public/'+e,{recursive:true});}
console.log(JSON.stringify(report));
