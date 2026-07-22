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

const supabase = createClient(
  SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

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

function mapperStatutTMDB(tmdbStatus: string) {
  return (tmdbStatus === 'Ended' || tmdbStatus === 'Canceled') ? 'Terminée' : 'En cours';
}

async function fetchTMDB(tmdbId: number) {
  const url = `${TMDB_BASE_URL}/tv/${tmdbId}?language=fr-FR&append_to_response=watch/providers,external_ids`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB HTTP ${response.status} pour tmdb_id=${tmdbId}`);
  }

  const d = await response.json();

  const providers = d["watch/providers"]?.results?.FR;
  let detectedPlatform = d.networks?.[0]?.name || null;
  let watchUrl = null;

  if (providers) {
    const targetProviders = [
      { id: 8, name: 'Netflix', keywords: ['netflix'] },
      { id: 119, name: 'Prime Video', keywords: ['prime video', 'amazon prime'] },
      { id: 337, name: 'Disney+', keywords: ['disney'] },
    ];

    if (providers.flatrate) {
      for (const target of targetProviders) {
        const found = providers.flatrate.find((p: any) =>
          p.provider_id === target.id ||
          (p.provider_name && target.keywords.some((k: string) => p.provider_name.toLowerCase().includes(k)))
        );
        if (found) {
          detectedPlatform = target.name;
          watchUrl = providers.link || null;
          break;
        }
      }
    }
  }

  return {
    titre: d.name,
    synopsis: d.overview || d.original_name,
    affiche_path: d.poster_path,
    backdrop_path: d.backdrop_path,
    statut_production: mapperStatutTMDB(d.status),
    plateforme: detectedPlatform,
    watch_url: watchUrl,
    imdb_id: d.external_ids?.imdb_id || null,
    saisons: (d.seasons || [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        numero_saison: s.season_number,
        nombre_episodes: s.episode_count,
      })),
    genres: (d.genres || []).map((g: any) => g.name).filter(Boolean),
  };
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
    const { tmdbId } = await req.json();
    const id = parseInt(tmdbId);
    if (!id || Number.isNaN(id)) {
      return jsonResponse(corsHeaders, { error: 'tmdbId invalide' }, 400);
    }

    const tmdb = await fetchTMDB(id);
    const now = new Date().toISOString();

    const { data: serieUpserted, error: serieError } = await supabase
      .from('series')
      .upsert(
        {
          tmdb_id: id,
          titre: tmdb.titre,
          synopsis: tmdb.synopsis,
          affiche_path: tmdb.affiche_path,
          backdrop_path: tmdb.backdrop_path,
          statut_production: tmdb.statut_production,
          plateforme: tmdb.plateforme,
          watch_url: tmdb.watch_url,
          imdb_id: tmdb.imdb_id,
          derniere_maj_tmdb: now,
        },
        { onConflict: 'tmdb_id' }
      )
      .select('id')
      .single();

    if (serieError) throw serieError;
    const serieId = serieUpserted.id;

    const { data: saisonsLocales } = await supabase
      .from('saisons')
      .select('id, numero_saison, nombre_episodes')
      .eq('serie_id', serieId);

    const localesMap = new Map((saisonsLocales || []).map((s: any) => [s.numero_saison, s]));

    // Une saison est "nouvelle" si aucune ligne locale n'existait pour ce numéro
    // (par opposition à une simple correction du nombre d'épisodes d'une saison déjà connue).
    let nouvelleSaisonDetectee = false;

    const saisonsPayload = tmdb.saisons.reduce((acc: any[], s: any) => {
      const locale = localesMap.get(s.numero_saison);
      if (!locale) nouvelleSaisonDetectee = true;
      if (!locale || locale.nombre_episodes !== s.nombre_episodes) {
        acc.push({
          ...(locale && { id: locale.id }),
          serie_id: serieId,
          numero_saison: s.numero_saison,
          nombre_episodes: s.nombre_episodes,
        });
      }
      return acc;
    }, []);

    if (saisonsPayload.length > 0) {
      const { error: saisonsError } = await supabase
        .from('saisons')
        .upsert(saisonsPayload, { onConflict: 'serie_id, numero_saison' });
      if (saisonsError) throw saisonsError;
    }

    // Thèmes (genres TMDB) : purement additif, ne retire jamais un thème déjà
    // lié (ex : ajouté ou affiné à la main) même si TMDB ne le renvoie plus.
    if (tmdb.genres.length > 0) {
      await supabase
        .from('themes')
        .upsert(tmdb.genres.map((nom: string) => ({ nom_theme: nom })), { onConflict: 'nom_theme', ignoreDuplicates: true });

      const { data: themeRows } = await supabase
        .from('themes')
        .select('id')
        .in('nom_theme', tmdb.genres);

      if (themeRows && themeRows.length > 0) {
        await supabase
          .from('series_themes')
          .upsert(
            themeRows.map((t: any) => ({ serie_id: serieId, theme_id: t.id })),
            { onConflict: 'serie_id, theme_id', ignoreDuplicates: true }
          );
      }
    }

    const { data: serieComplete, error: reloadError } = await supabase
      .from('series')
      .select('*, saisons (*), series_themes (theme_id, themes (id, nom_theme))')
      .eq('id', serieId)
      .single();

    if (reloadError) throw reloadError;

    return jsonResponse(corsHeaders, { ...serieComplete, nouvelleSaisonDetectee });
  } catch (err) {
    return jsonResponse(corsHeaders, { error: err.message }, 500);
  }
});
