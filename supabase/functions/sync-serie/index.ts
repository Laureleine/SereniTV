import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_ACCESS_TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN');
const APP_SHARED_SECRET = Deno.env.get('APP_SHARED_SECRET');

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function mapperStatutTMDB(tmdbStatus: string) {
  return (tmdbStatus === 'Ended' || tmdbStatus === 'Canceled') ? 'Terminée' : 'En cours';
}

async function fetchTMDB(tmdbId: number) {
  const url = `${TMDB_BASE_URL}/tv/${tmdbId}?language=fr-FR&append_to_response=watch/providers`;
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
    saisons: (d.seasons || [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        numero_saison: s.season_number,
        nombre_episodes: s.episode_count,
      })),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (APP_SHARED_SECRET && req.headers.get('x-app-secret') !== APP_SHARED_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  try {
    const { tmdbId } = await req.json();
    const id = parseInt(tmdbId);
    if (!id || Number.isNaN(id)) {
      return jsonResponse({ error: 'tmdbId invalide' }, 400);
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

    const { data: serieComplete, error: reloadError } = await supabase
      .from('series')
      .select('*, saisons (*)')
      .eq('id', serieId)
      .single();

    if (reloadError) throw reloadError;

    return jsonResponse({ ...serieComplete, nouvelleSaisonDetectee });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});
