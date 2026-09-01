import { scanDomain } from '../../lib/scanner.mjs';

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const result = await scanDomain(url.searchParams.get('domain'));
    return Response.json(result, {headers:{'Cache-Control':'public, max-age=300','Access-Control-Allow-Origin':'*'}});
  } catch (error) {
    return Response.json({error:error.message || 'Scan failed.'},{status:400});
  }
}
