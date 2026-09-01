const form = document.querySelector('#scan-form');
const statusBox = document.querySelector('#status');
const results = document.querySelector('#results');
const button = document.querySelector('#scan-button');
let latest;
let progressTimer;
let scanStartedAt;
const scanStages = [
  [0, 'Contacting certificate indexes'],
  [2.5, 'Collecting and deduplicating hostnames'],
  [5, 'Resolving current DNS records'],
  [9, 'Looking up passive port observations'],
  [15, 'Still working through discovered hosts']
];

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const domain = new FormData(form).get('domain').trim();
  startProgress(domain);
  results.classList.add('hidden'); button.disabled = true;
  try {
    const response = await fetch(`/api/scan?domain=${encodeURIComponent(domain)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The scan failed.');
    latest = data; render(data);
    finishProgress(data.durationMs);
  } catch (error) { failProgress(error.message); }
  finally { button.disabled = false; }
});

document.querySelector('#json-export').addEventListener('click', () => download(`${latest.domain}-domain-scout.json`, JSON.stringify(latest, null, 2), 'application/json'));
document.querySelector('#csv-export').addEventListener('click', () => {
  const rows = [['hostname','addresses','cname','known_ports','notes'], ...latest.hosts.map(h => [h.hostname,h.addresses.join(' '),h.cname.join(' '),h.ports.join(' '),h.notes.join(' | ')])];
  download(`${latest.domain}-domain-scout.csv`, rows.map(r => r.map(csv).join(',')).join('\n'), 'text/csv');
});

function render(data) {
  const uniqueIps = new Set(data.hosts.flatMap(h => h.addresses));
  const portCount = new Set(data.hosts.flatMap(h => h.ports.map(p => `${h.addresses[0]}:${p}`))).size;
  document.querySelector('#summary').innerHTML = [
    [data.hosts.length,'Discovered hosts'], [data.liveHosts,'DNS-resolving hosts'], [uniqueIps.size,'Unique addresses'], [portCount,'Indexed IP:ports']
  ].map(([v,l]) => `<div class="metric"><strong>${v}</strong><span>${l}</span></div>`).join('');
  const used = data.discoverySources?.length ? `Subdomains: ${data.discoverySources.join(' + ')}` : 'No subdomain source responded';
  document.querySelector('#source-note').textContent = data.warnings.length ? `${used} · ${data.warnings.join(' · ')}` : `${used} · Current DNS + passive port index`;
  document.querySelector('#host-rows').innerHTML = data.hosts.map(host => `
    <tr><td><code>${escapeHtml(host.hostname)}</code></td>
    <td>${host.addresses.length ? host.addresses.map(x=>`<code>${escapeHtml(x)}</code>`).join('<br>') : '<span class="muted">No A/AAAA response</span>'}${host.cname.length ? `<br><span class="muted">CNAME → ${host.cname.map(escapeHtml).join(', ')}</span>` : ''}</td>
    <td><div class="chips">${host.ports.length ? host.ports.map(p=>`<span class="chip">${p}</span>`).join('') : '<span class="muted">None indexed</span>'}</div></td>
    <td>${host.notes.length ? host.notes.map(n=>`<div class="${/publicly exposed|sensitive/i.test(n)?'danger':'warning'}">${escapeHtml(n)}</div>`).join('') : '<span class="muted">No immediate observation</span>'}</td></tr>`).join('');
  results.classList.remove('hidden');
}
function startProgress(domain){
  clearInterval(progressTimer); scanStartedAt=performance.now();
  statusBox.className='status';
  statusBox.innerHTML=`<div class="progress-head"><strong id="progress-stage">Starting scan</strong><span id="elapsed">0.0s</span></div><div class="progress-track"><div id="progress-fill" class="progress-fill"></div></div><div class="progress-detail">Passive discovery for <code>${escapeHtml(domain)}</code></div>`;
  const update=()=>{
    const seconds=(performance.now()-scanStartedAt)/1000;
    const percent=Math.min(92,5+87*(1-Math.exp(-seconds/8)));
    document.querySelector('#elapsed').textContent=`${seconds.toFixed(1)}s`;
    document.querySelector('#progress-fill').style.width=`${percent}%`;
    document.querySelector('#progress-stage').textContent=[...scanStages].reverse().find(([at])=>seconds>=at)?.[1]||'Starting scan';
  };
  update(); progressTimer=setInterval(update,100);
}
function finishProgress(serverDuration){
  clearInterval(progressTimer);
  const elapsed=(performance.now()-scanStartedAt)/1000;
  document.querySelector('#progress-fill').style.width='100%';
  document.querySelector('#progress-fill').classList.add('complete');
  document.querySelector('#progress-stage').textContent='Scan complete';
  document.querySelector('#elapsed').textContent=`${elapsed.toFixed(1)}s`;
  document.querySelector('.progress-detail').textContent=`Server scan: ${(serverDuration/1000).toFixed(1)}s · Total browser time: ${elapsed.toFixed(1)}s`;
}
function failProgress(message){
  clearInterval(progressTimer); statusBox.className='status error';
  statusBox.innerHTML=`<div class="progress-head"><strong>Scan failed</strong><span>${((performance.now()-scanStartedAt)/1000).toFixed(1)}s</span></div><div>${escapeHtml(message)}</div>`;
}
function escapeHtml(value){ return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function csv(value){ return `"${String(value).replaceAll('"','""')}"`; }
function download(name,content,type){ const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
