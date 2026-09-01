const DOH = 'https://cloudflare-dns.com/dns-query';
const RISKY = new Map([[21,'FTP publicly exposed'],[22,'SSH publicly exposed'],[23,'Telnet is publicly exposed'],[2375,'Unauthenticated Docker API may be exposed'],[3306,'MySQL publicly exposed'],[3389,'RDP publicly exposed'],[5038,'Asterisk Manager may be exposed'],[5060,'SIP publicly exposed'],[5432,'PostgreSQL publicly exposed'],[6379,'Redis publicly exposed'],[9200,'Elasticsearch publicly exposed'],[11211,'Memcached publicly exposed'],[27017,'MongoDB publicly exposed']]);

export function normalizeDomain(input) {
  let value = String(input || '').trim().toLowerCase().replace(/\.$/, '');
  try { if (value.includes('://')) value = new URL(value).hostname; } catch {}
  if (value.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) throw new Error('Enter a valid domain such as example.com.');
  return value;
}

export async function scanDomain(rawDomain, fetcher = fetch) {
  const started = Date.now(), domain = normalizeDomain(rawDomain), warnings = [], discoverySources = [];
  let names = [domain];
  try {
    const response = await safeFetch(fetcher, `https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`, {headers:{'User-Agent':'Domain-Scout/0.1'}}, 12000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const certs = await response.json();
    names.push(...certs.flatMap(x => String(x.name_value || '').split(/\s+/)));
    discoverySources.push('crt.sh');
  } catch (error) { warnings.push(`crt.sh unavailable (${error.message})`); }

  // crt.sh is occasionally slow or unavailable. Cert Spotter provides an
  // independent Certificate Transparency index and returns SAN DNS names.
  try {
    const endpoint = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`;
    const response = await safeFetch(fetcher, endpoint, {headers:{'User-Agent':'Domain-Scout/0.2'}}, 12000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const issuances = await response.json();
    names.push(...issuances.flatMap(x => Array.isArray(x.dns_names) ? x.dns_names : []));
    discoverySources.push('Cert Spotter');
  } catch (error) { warnings.push(`Cert Spotter unavailable (${error.message})`); }
  names = [...new Set(names.map(cleanName).filter(x => x && (x === domain || x.endsWith(`.${domain}`))))].sort().slice(0, 75);

  const hosts = await mapLimit(names, 6, async hostname => {
    const [a, aaaa, cname] = await Promise.all(['A','AAAA','CNAME'].map(type => resolve(hostname,type,fetcher)));
    const addresses = [...new Set([...a,...aaaa])].filter(isPublicAddress);
    let ports = [];
    for (const ip of addresses.slice(0, 3)) {
      try {
        const response = await safeFetch(fetcher, `https://internetdb.shodan.io/${encodeURIComponent(ip)}`, {}, 5000);
        if (response.ok) ports.push(...((await response.json()).ports || []));
      } catch {}
    }
    ports = [...new Set(ports)].sort((x,y)=>x-y);
    const notes = ports.filter(p=>RISKY.has(p)).map(p=>RISKY.get(p));
    if (addresses.length && addresses.every(isCloudflareAddress)) notes.push('Likely Cloudflare-proxied address');
    return {hostname, addresses, cname, ports, notes};
  });
  if (!discoverySources.length) warnings.push('No certificate discovery source responded; only the apex domain was checked.');
  return {domain, scannedAt:new Date().toISOString(), durationMs:Date.now()-started, liveHosts:hosts.filter(h=>h.addresses.length||h.cname.length).length, discoverySources, warnings, hosts};
}

async function resolve(name,type,fetcher){ try { const r=await safeFetch(fetcher,`${DOH}?name=${encodeURIComponent(name)}&type=${type}`,{headers:{accept:'application/dns-json'}},5000); const j=await r.json(); return (j.Answer||[]).filter(x=>x.type===({A:1,CNAME:5,AAAA:28}[type])).map(x=>String(x.data).replace(/\.$/,'')); } catch { return []; } }
async function safeFetch(fetcher,url,options,timeoutMs){ const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs); try{return await fetcher(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);} }
function cleanName(name){ const x=String(name).trim().toLowerCase().replace(/^\*\./,'').replace(/\.$/,''); return /^[a-z0-9.-]+$/.test(x)?x:''; }
function isPublicAddress(ip){ if (ip.includes(':')) return !/^(::1|f[cd]|fe[89ab])/i.test(ip); const p=ip.split('.').map(Number); return p.length===4 && !(p[0]===10||p[0]===127||p[0]===0||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]>=224); }
function isCloudflareAddress(ip){ return ip.includes(':') ? /^(2606:4700|2803:f800|2405:b500|2405:8100|2a06:98c0|2c0f:f248)/i.test(ip) : ['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22'].some(c=>inCidr(ip,c)); }
function inCidr(ip,cidr){ const [net,bits]=cidr.split('/'); const n=s=>s.split('.').reduce((a,x)=>(a<<8)+Number(x),0)>>>0; const mask=bits==='0'?0:(0xffffffff<<(32-Number(bits)))>>>0; return (n(ip)&mask)===(n(net)&mask); }
async function mapLimit(items,limit,fn){ const out=new Array(items.length); let cursor=0; await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{ while(cursor<items.length){const i=cursor++;out[i]=await fn(items[i]);} })); return out; }
