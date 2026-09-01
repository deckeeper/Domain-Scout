import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { scanDomain } from './lib/scanner.mjs';

const root = join(process.cwd(),'public');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'};
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost:8788');
    if(url.pathname==='/api/scan'){
      const body=JSON.stringify(await scanDomain(url.searchParams.get('domain')));
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(body);
    }
    let path=normalize(join(root,url.pathname==='/'?'index.html':url.pathname));
    if(!path.startsWith(root)||(await stat(path)).isDirectory()) path=join(root,'index.html');
    res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path));
  }catch(error){res.writeHead(error.code==='ENOENT'?404:400,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
}).listen(8788,'127.0.0.1',()=>console.log('Domain Scout: http://127.0.0.1:8788'));
