import {rm,readdir} from 'node:fs/promises';
// Keep Next's compilation cache, but never archive stale chunks from older releases.
await rm('.next/static',{recursive:true,force:true});
await rm('.offline-public',{recursive:true,force:true});
for(const entry of await readdir('public').catch(()=>[]))if(entry.startsWith('offline-')||entry==='offline.css'||entry==='index.html')await rm('public/'+entry,{recursive:true,force:true});
