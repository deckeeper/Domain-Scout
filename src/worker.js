import { scanDomain } from '../lib/scanner.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/scan') {
      if (request.method !== 'GET') {
        return Response.json(
          { error: 'Method not allowed.' },
          { status: 405 }
        );
      }

      try {
        const result = await scanDomain(
          url.searchParams.get('domain')
        );

        return Response.json(result, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        return Response.json(
          { error: error.message || 'Scan failed.' },
          { status: 400 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
