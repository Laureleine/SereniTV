import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_ACCESS_TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN');
const APP_SHARED_SECRET = Deno.env.get('APP_SHARED_SECRET');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (APP_SHARED_SECRET && req.headers.get('x-app-secret') !== APP_SHARED_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  try {
    const { query } = await req.json();

    if (!query || query.trim().length < 2) {
      return jsonResponse([]);
    }

    const url = `${TMDB_BASE_URL}/search/tv?query=${encodeURIComponent(query)}&language=fr-FR&page=1`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`TMDB HTTP ${response.status}`);
    }

    const data = await response.json();

    const results = (data.results || [])
      .filter((r: any) => r.name && r.id)
      .slice(0, 7)
      .map((r: any) => ({
        tmdbId: r.id,
        titre: r.name,
        titre_orig: r.original_name !== r.name ? r.original_name : null,
        annee: r.first_air_date ? r.first_air_date.slice(0, 4) : '—',
        affiche_path: r.poster_path,
        popularite: r.popularity,
      }));

    return jsonResponse(results);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});
