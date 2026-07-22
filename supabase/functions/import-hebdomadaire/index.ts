import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_ACCESS_TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const INTERNAL_IMPORT_SECRET = Deno.env.get('INTERNAL_IMPORT_SECRET');

const supabase = createClient(
  SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const NB_ANCIENNES_PAR_SEMAINE = 100;
const MAX_PAGE_DISCOVER = 500; // limite dure de l'API TMDB

function mapperStatutTMDB(tmdbStatus: string) {
  return (tmdbStatus === 'Ended' || tmdbStatus === 'Canceled') ? 'Terminée' : 'En cours';
}

async function tmdbFetch(path: string) {
  const response = await fetch(`${TMDB_BASE_URL}${path}`, {
    headers: {
      'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`TMDB HTTP ${response.status} pour ${path}`);
  }
  return response.json();
}

async function fetchDetailsTMDB(tmdbId: number) {
  const d = await tmdbFetch(`/tv/${tmdbId}?language=fr-FR&append_to_response=watch/providers,external_ids`);

  const providers = d["watch/providers"]?.results?.FR;
  let detectedPlatform = d.networks?.[0]?.name || null;
  let watchUrl = null;

  if (providers?.flatrate) {
    const targetProviders = [
      { id: 8, name: 'Netflix', keywords: ['netflix'] },
      { id: 119, name: 'Prime Video', keywords: ['prime video', 'amazon prime'] },
      { id: 337, name: 'Disney+', keywords: ['disney'] },
    ];
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

/** Importe une série TMDB complète (fiche + saisons + thèmes) dans le catalogue partagé. */
async function importerSerie(tmdbId: number, estNouveaute: boolean) {
  const tmdb = await fetchDetailsTMDB(tmdbId);

  const { data: serieUpserted, error: serieError } = await supabase
    .from('series')
    .upsert(
      {
        tmdb_id: tmdbId,
        titre: tmdb.titre,
        synopsis: tmdb.synopsis,
        affiche_path: tmdb.affiche_path,
        backdrop_path: tmdb.backdrop_path,
        statut_production: tmdb.statut_production,
        plateforme: tmdb.plateforme,
        watch_url: tmdb.watch_url,
        imdb_id: tmdb.imdb_id,
        est_nouveaute: estNouveaute,
        derniere_maj_tmdb: new Date().toISOString(),
      },
      { onConflict: 'tmdb_id' }
    )
    .select('id')
    .single();

  if (serieError) throw serieError;
  const serieId = serieUpserted.id;

  if (tmdb.saisons.length > 0) {
    const { error: saisonsError } = await supabase
      .from('saisons')
      .upsert(
        tmdb.saisons.map((s: any) => ({ serie_id: serieId, numero_saison: s.numero_saison, nombre_episodes: s.nombre_episodes })),
        { onConflict: 'serie_id, numero_saison' }
      );
    if (saisonsError) throw saisonsError;
  }

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
}

async function getTmdbIdsExistants(): Promise<Set<number>> {
  const { data, error } = await supabase.from('series').select('tmdb_id');
  if (error) throw error;
  return new Set((data || []).map((s: any) => s.tmdb_id));
}

function attendre(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Flux 1 : toutes les séries dont la première diffusion date des 7 derniers jours (Nouveautés). */
async function importerNouveautes(dejaConnus: Set<number>) {
  const aujourdHui = new Date();
  const ilYA7Jours = new Date(aujourdHui.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let page = 1;
  let totalPages = 1;
  let importees = 0;
  let echecs = 0;

  do {
    const data = await tmdbFetch(
      `/discover/tv?first_air_date.gte=${fmt(ilYA7Jours)}&first_air_date.lte=${fmt(aujourdHui)}&sort_by=popularity.desc&page=${page}`
    );
    totalPages = Math.min(data.total_pages || 1, MAX_PAGE_DISCOVER);

    for (const r of data.results || []) {
      if (dejaConnus.has(r.id)) continue;
      try {
        await importerSerie(r.id, true);
        dejaConnus.add(r.id);
        importees++;
      } catch (err) {
        console.error(`[IMPORT NOUVEAUTES] Échec tmdb_id=${r.id}:`, (err as Error).message);
        echecs++;
      }
      await attendre(250);
    }
    page++;
  } while (page <= totalPages);

  return { importees, echecs };
}

/** Flux 2 : les 100 séries les plus populaires pas encore au catalogue (backfill progressif). */
async function importerAnciennes(dejaConnus: Set<number>, pageDepart: number) {
  let page = pageDepart;
  let importees = 0;
  let echecs = 0;

  while (importees < NB_ANCIENNES_PAR_SEMAINE && page <= MAX_PAGE_DISCOVER) {
    const data = await tmdbFetch(`/discover/tv?sort_by=popularity.desc&page=${page}`);
    const resultats = data.results || [];
    if (resultats.length === 0) break;

    for (const r of resultats) {
      if (importees >= NB_ANCIENNES_PAR_SEMAINE) break;
      if (dejaConnus.has(r.id)) continue;
      try {
        await importerSerie(r.id, false);
        dejaConnus.add(r.id);
        importees++;
      } catch (err) {
        console.error(`[IMPORT ANCIENNES] Échec tmdb_id=${r.id}:`, (err as Error).message);
        echecs++;
      }
      await attendre(250);
    }
    page++;
  }

  return { importees, echecs, pageSuivante: page };
}

Deno.serve(async (req: Request) => {
  const secretRecu = req.headers.get('x-internal-secret');
  if (!INTERNAL_IMPORT_SECRET || secretRecu !== INTERNAL_IMPORT_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { data: etat, error: etatError } = await supabase
      .from('import_auto_etat')
      .select('discover_tv_last_page')
      .eq('id', 1)
      .single();
    if (etatError) throw etatError;

    const dejaConnus = await getTmdbIdsExistants();

    const resultatNouveautes = await importerNouveautes(dejaConnus);
    const resultatAnciennes = await importerAnciennes(dejaConnus, etat.discover_tv_last_page);

    await supabase
      .from('import_auto_etat')
      .update({
        discover_tv_last_page: resultatAnciennes.pageSuivante,
        derniere_execution: new Date().toISOString(),
      })
      .eq('id', 1);

    return new Response(JSON.stringify({
      nouveautes: resultatNouveautes,
      anciennes: resultatAnciennes,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[IMPORT HEBDOMADAIRE] Erreur globale:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
