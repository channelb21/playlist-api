export default {
  async fetch(request, env, ctx) {
    const urlObj = new URL(request.url);
    
    // Create consistent CORS headers matching your original PHP settings
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    // 0. Handle CORS preflight OPTIONS requests gracefully
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders, status: 200 });
    }

    // Only process requests aimed at your api URL logic path
    if (urlObj.pathname.endsWith('/api.php')) {
      
      // 1. Get the playlist URL from the query string
      const playlistUrl = urlObj.searchParams.get('url');

      if (!playlistUrl) {
        return new Response(
          JSON.stringify({ error: 'No playlist URL provided. Use api.php?url=YOUR_URL' }), 
          { headers: corsHeaders, status: 200 }
        );
      }

      try {
        // 2. Fetch the M3U content using native global fetch engine
        const m3uResponse = await fetch(playlistUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          // Workers use internal signal handling for timeouts. 
          // Native global fetch defaults safely inside Cloudflare's edge pipeline max limits.
        });

        if (m3uResponse.status !== 200) {
          return new Response(
            JSON.stringify({ error: 'Failed to fetch the M3U file. HTTP Status: ' + m3uResponse.status }), 
            { headers: corsHeaders, status: 200 }
          );
        }

        const content = await m3uResponse.text();

        // 3. Parse the M3U file content
        const lines = content.split('\n');
        const playlist = [];
        let current = {};

        for (let line of lines) {
          line = line.trim();

          if (!line) {
            continue;
          }

          if (line.indexOf('#EXTINF') === 0) {
            // Extract logo
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            
            // Extract channel name (everything after the last comma)
            const commaPos = line.lastIndexOf(',');
            const name = (commaPos !== -1) ? line.substring(commaPos + 1) : 'Unknown Channel';

            current = {
              name: name.trim(),
              logo: logoMatch ? logoMatch[1] : ''
            };
            
          } else if (line.indexOf('#KODIPROP') === 0 && line.includes('license_key=')) {
            // Extract ClearKey DRM data
            const keyInfo = line.match(/license_key=(.*?):(.*)/);
            if (keyInfo) {
              current.drm = 'clearkey';
              current.keyId = keyInfo[1].trim();
              current.key = keyInfo[2].trim();
            }
            
          } else if (line.indexOf('#') !== 0) {
            // Line is a True URL
            if (line.indexOf('http://') === 0 || line.indexOf('https://') === 0) {
                
              // Keep matching wrapper logic routing unsecured links via stream.php
              if (!current.drm) {
                current.url = "stream.php?stream_url=" + encodeURIComponent(line);
              } else {
                current.url = line;
              }

              playlist.push(current);
            }
            
            current = {}; // Reset container state for next channel iteration
          }
        }

        // 4. Return the parsed array directly as standard JSON format response
        return new Response(JSON.stringify(playlist), { headers: corsHeaders, status: 200 });

      } catch (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch the M3U file due to an internal execution error.' }), 
          { headers: corsHeaders, status: 200 }
        );
      }
    }

    // Default response fallback if route pattern structure is unmatched
    return new Response('Not Found', { status: 404 });
  },
};