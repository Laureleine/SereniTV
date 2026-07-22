import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ['https://sereni-tv.vercel.app'];

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_ACCESS_TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function jsonResponse(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Vérifie le JWT de la requête auprès de Supabase Auth (au lieu de faire
// confiance à un secret partagé, forcément visible dans le bundle client).
async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!(await getAuthenticatedUserId(req))) {
    return jsonResponse(corsHeaders, { error: 'unauthorized' }, 401);
  }

  try {
    const { query } = await req.json();

    if (!query || query.trim().length < 2) {
      return jsonResponse(corsHeaders, []);
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

    return jsonResponse(corsHeaders, results);
  } catch (err) {
    return jsonResponse(corsHeaders, { error: err.message }, 500);
  }
});
