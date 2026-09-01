import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, scanDomain } from '../lib/scanner.mjs';

test('normalizes a URL to a hostname',()=>assert.equal(normalizeDomain('https://WWW.Example.com/path'),'www.example.com'));
test('rejects IPs and malformed targets',()=>{ for(const value of ['127.0.0.1','localhost','bad domain']) assert.throws(()=>normalizeDomain(value)); });
test('deduplicates certificate names and resolves DNS',async()=>{
  const fake=async url=>{
    if(String(url).includes('crt.sh')) return new Response(JSON.stringify([{name_value:'www.example.com\n*.example.com'},{name_value:'www.example.com'}]));
    if(String(url).includes('certspotter')) return Response.json([{dns_names:['api.example.com','www.example.com']}]);
    if(String(url).includes('cloudflare-dns')) { const u=new URL(url); return Response.json({Answer:u.searchParams.get('type')==='A'?[{type:1,data:'203.0.113.9'}]:[]}); }
    return new Response('',{status:404});
  };
  const result=await scanDomain('example.com',fake);
  assert.deepEqual(result.hosts.map(x=>x.hostname),['api.example.com','example.com','www.example.com']);
});
test('still returns the apex when certificate discovery fails',async()=>{
  const result=await scanDomain('example.com',async url=>{ if(String(url).includes('crt.sh')||String(url).includes('certspotter')) throw new Error('offline'); return Response.json({}); });
  assert.equal(result.hosts[0].hostname,'example.com');
  assert.match(result.warnings[0],/unavailable/);
});
