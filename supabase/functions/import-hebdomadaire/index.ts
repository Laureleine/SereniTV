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

// N'importer que des séries ayant au moins une offre légale (streaming/location/achat)
// en France — le proxy le plus fiable disponible côté TMDB pour approcher "VF ou VOSTFR".
const FILTRE_DISPONIBILITE_FR = '&watch_region=FR&with_watch_monetization_types=flatrate%7Cfree%7Cads%7Crent%7Cbuy';

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
  const d = await tmdbFetch(`/tv/${tmdbId}?language=fr-FR&append_to_response=watch/providers,external_ids,keywords`);

  const providers = d["watch/providers"]?.results?.FR;
  let detectedPlatform = d.networks?.[0]?.name || null;
  let watchUrl = null;

  // Abonnement, gratuit ou gratuit avec pub (le replay TF1+/M6+ est souvent « ads »).
  const offres = [...(providers?.flatrate || []), ...(providers?.free || []), ...(providers?.ads || [])];
  if (offres.length > 0) {
    const targetProviders = [
      { id: 8, name: 'Netflix', keywords: ['netflix'] },
      { id: 119, name: 'Prime Video', keywords: ['prime video', 'amazon prime'] },
      { id: 337, name: 'Disney+', keywords: ['disney'] },
      { id: 1754, name: 'TF1+', keywords: [] },
      { id: 147, name: 'M6+', keywords: [] },
      { id: 381, name: 'Canal+', keywords: [] },
      { id: 345, name: 'Canal+', keywords: [] },
      { id: 234, name: 'Arte', keywords: [] },
    ];
    for (const target of targetProviders) {
      const found = offres.find((p: any) =>
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
    langue_originale: d.original_language || null,
    pays_origine: d.origin_country?.[0] || null,
    saisons: (d.seasons || [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        numero_saison: s.season_number,
        nombre_episodes: s.episode_count,
      })),
    genres: (d.genres || []).map((g: any) => g.name).filter(Boolean),
    motsCles: (d.keywords?.results || []).map((k: any) => String(k.name).toLowerCase()),
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
        langue_originale: tmdb.langue_originale,
        pays_origine: tmdb.pays_origine,
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

  // Mots-clés TMDB conservés + thèmes automatiques (Médical, Policier…).
  await supabase
    .from('series_mots_cles')
    .upsert({ serie_id: serieId, mots_cles: tmdb.motsCles, recu_at: new Date().toISOString() });
  await supabase.rpc('appliquer_themes_auto', { p_serie_id: serieId });
}

async function getTmdbIdsExistants(): Promise<Set<number>> {
  // Par pages : l'API plafonne chaque réponse à 1000 lignes. Sans ça, les
  // séries au-delà étaient prises pour inconnues et réimportées chaque semaine.
  const ids = new Set<number>();
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from('series')
      .select('tmdb_id')
      .order('id')
      .range(debut, debut + 999);
    if (error) throw error;
    (data || []).forEach((s: any) => ids.add(s.tmdb_id));
    if (!data || data.length < 1000) break;
  }
  return ids;
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
      `/discover/tv?first_air_date.gte=${fmt(ilYA7Jours)}&first_air_date.lte=${fmt(aujourdHui)}&sort_by=popularity.desc&page=${page}${FILTRE_DISPONIBILITE_FR}`
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
    const data = await tmdbFetch(`/discover/tv?sort_by=popularity.desc&page=${page}${FILTRE_DISPONIBILITE_FR}`);
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

/**
 * Rattrapage ponctuel d'une ou plusieurs plateformes (8 Netflix, 119 Prime Video,
 * 337 Disney+, « 1754|147 » pour TF1+ ou M6+…) : importe au plus `lot` séries
 * manquantes parmi leurs `rangMax` plus populaires en France, éventuellement
 * restreintes à un pays d'origine et sans certains genres TMDB.
 * À rappeler jusqu'à ce qu'il renvoie importees = 0.
 */
async function rattraperPlateforme(
  dejaConnus: Set<number>, fournisseur: string, rangMax: number, lot: number,
  options: { pays?: string; sansGenres?: string } = {}
) {
  let importees = 0;
  let echecs = 0;
  let restantes = 0;
  const nbPages = Math.ceil(rangMax / 20);
  const filtres = (options.pays ? `&with_origin_country=${encodeURIComponent(options.pays)}` : '')
    + (options.sansGenres ? `&without_genres=${encodeURIComponent(options.sansGenres)}` : '');

  for (let page = 1; page <= nbPages; page++) {
    const data = await tmdbFetch(
      `/discover/tv?sort_by=popularity.desc&page=${page}&watch_region=FR&with_watch_providers=${encodeURIComponent(fournisseur)}${filtres}`
    );
    const resultats = data.results || [];
    if (resultats.length === 0) break;

    for (const r of resultats) {
      if (dejaConnus.has(r.id)) continue;
      if (importees + echecs >= lot) { restantes++; continue; }
      try {
        await importerSerie(r.id, false);
        dejaConnus.add(r.id);
        importees++;
      } catch (err) {
        console.error(`[RATTRAPAGE ${fournisseur}] Échec tmdb_id=${r.id}:`, (err as Error).message);
        echecs++;
      }
      await attendre(250);
    }
  }

  return { importees, echecs, restantes };
}

Deno.serve(async (req: Request) => {
  const secretRecu = req.headers.get('x-internal-secret');
  if (!INTERNAL_IMPORT_SECRET || secretRecu !== INTERNAL_IMPORT_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const corps = await req.json().catch(() => ({}));
    if (corps?.rattrapage) {
      const { fournisseur, rangMax = 500, lot = 40, pays, sansGenres } = corps.rattrapage;
      const resultat = await rattraperPlateforme(
        await getTmdbIdsExistants(), String(fournisseur), Number(rangMax), Number(lot), { pays, sansGenres }
      );
      return new Response(JSON.stringify({ rattrapage: fournisseur, ...resultat }), { headers: { 'Content-Type': 'application/json' } });
    }

    const dejaConnus = await getTmdbIdsExistants();

    const resultatNouveautes = await importerNouveautes(dejaConnus);
    // Toujours depuis la page 1 : le classement de popularité bouge d'une semaine
    // à l'autre, et un curseur qui ne revient jamais en arrière laissait passer
    // pour toujours des séries très populaires (The Boys…). Les séries déjà au
    // catalogue sont simplement sautées.
    const resultatAnciennes = await importerAnciennes(dejaConnus, 1);

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
