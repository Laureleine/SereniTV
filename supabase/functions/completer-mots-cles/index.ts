import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Récupère les mots-clés TMDB des séries qui n'en ont pas encore (rattrapage
// du catalogue, filet de sécurité), les conserve dans series_mots_cles, puis
// applique les thèmes automatiques (appliquer_themes_auto). Les nouvelles
// séries reçoivent normalement leurs mots-clés dès l'import (sync-serie,
// import-hebdomadaire). Gardée par le secret interne serveur-à-serveur.
const INTERNAL_IMPORT_SECRET = Deno.env.get('INTERNAL_IMPORT_SECRET');
const TMDB_ACCESS_TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN');
const MAX_PAR_APPEL = 400; // reste sous la durée maximale d'une Edge Function
const CONCURRENCE = 8;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Toutes les lignes d'une colonne, par pages (l'API plafonne à 1000 lignes). */
async function toutesLesLignes(table: string, colonnes: string, ordre: string) {
  const lignes: any[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase.from(table).select(colonnes).order(ordre).range(debut, debut + 999);
    if (error) throw error;
    lignes.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return lignes;
}

async function motsClesTMDB(tmdbId: number): Promise<string[]> {
  const response = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/keywords`, {
    headers: { 'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}` },
  });
  if (!response.ok) throw new Error(`TMDB HTTP ${response.status} pour tv/${tmdbId}/keywords`);
  const d = await response.json();
  return (d.results ?? []).map((k: any) => String(k.name).toLowerCase());
}

Deno.serve(async (req: Request) => {
  if (!INTERNAL_IMPORT_SECRET || req.headers.get('x-internal-secret') !== INTERNAL_IMPORT_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  try {
    const series = await toutesLesLignes('series', 'id, tmdb_id', 'id');
    const dejaFaites = new Set((await toutesLesLignes('series_mots_cles', 'serie_id', 'serie_id')).map(r => r.serie_id));
    const aFaire = series.filter(s => s.tmdb_id && !dejaFaites.has(s.id)).slice(0, MAX_PAR_APPEL);

    let traitees = 0, echecs = 0;
    for (let i = 0; i < aFaire.length; i += CONCURRENCE) {
      await Promise.all(aFaire.slice(i, i + CONCURRENCE).map(async (s) => {
        try {
          const mots_cles = await motsClesTMDB(s.tmdb_id);
          const { error } = await supabase.from('series_mots_cles').upsert({ serie_id: s.id, mots_cles, recu_at: new Date().toISOString() });
          if (error) throw error;
          traitees++;
        } catch (err) {
          console.error(`[MOTS-CLES] Échec serie_id=${s.id}:`, (err as Error).message);
          echecs++;
        }
      }));
    }

    const { data: themesAjoutes, error: erreurThemes } = await supabase.rpc('appliquer_themes_auto');
    if (erreurThemes) throw erreurThemes;

    const restantes = series.filter(s => s.tmdb_id && !dejaFaites.has(s.id)).length - traitees;
    console.log(`[MOTS-CLES] ${traitees} série(s) traitée(s), ${echecs} échec(s), ${themesAjoutes} thème(s) ajouté(s), ${restantes} restante(s).`);
    return jsonResponse({ success: true, traitees, echecs, themesAjoutes, restantes });
  } catch (err) {
    console.error('[MOTS-CLES] Erreur:', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
