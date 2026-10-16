import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Appelée uniquement par le cron pg_cron « verifier-versions » (1 fois par
// jour), gardée par le secret interne serveur-à-serveur des autres crons.
//
// Pour un lot de séries (ordre de priorité calculé par la fonction SQL
// series_a_verifier), interroge l'API Streaming Availability (Movie of the
// Night) et enregistre si une VF et/ou une VOSTFR existe en France sur une
// offre par abonnement, gratuite ou « chaîne » en option (location/achat
// ignorés). Le quota gratuit est de 1000 requêtes/mois (plafond dur) : on en
// consomme au plus LOT_PAR_JOUR par jour.
const INTERNAL_IMPORT_SECRET = Deno.env.get('INTERNAL_IMPORT_SECRET');
const API_KEY = Deno.env.get('STREAMING_AVAILABILITY_API_KEY');
const API_URL = 'https://api.movieofthenight.com/v4/shows';

const LOT_PAR_JOUR = 30; // 30 × 31 jours = 930 < 1000 requêtes/mois
const TYPES_RETENUS = new Set(['subscription', 'free', 'addon']);
const CODES_FRANCAIS = new Set(['fra', 'fre', 'fr']); // ISO 639-2 (doc) + 639-1 (exemples)

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

const estFrancais = (locale: any) => CODES_FRANCAIS.has(String(locale?.language ?? '').toLowerCase());

/** null si le quota est épuisé (on arrête le lot), sinon {vf, vostfr}. */
async function verifierSerie(tmdbId: number): Promise<{ vf: boolean; vostfr: boolean } | null> {
  const response = await fetch(`${API_URL}/tv/${tmdbId}?country=fr`, {
    headers: { 'X-API-Key': API_KEY! },
  });
  if (response.status === 429) return null;
  // Série inconnue de l'API : on la marque vérifiée (rien de disponible) pour
  // ne pas la redemander chaque jour.
  if (response.status === 404) return { vf: false, vostfr: false };
  if (!response.ok) throw new Error(`HTTP ${response.status} pour tv/${tmdbId}`);

  const show = await response.json();
  const offres = (show.streamingOptions?.fr ?? []).filter((o: any) => TYPES_RETENUS.has(o.type));
  return {
    vf: offres.some((o: any) => (o.audios ?? []).some(estFrancais)),
    vostfr: offres.some((o: any) => (o.subtitles ?? []).some((s: any) => estFrancais(s.locale))),
  };
}

Deno.serve(async (req: Request) => {
  if (!INTERNAL_IMPORT_SECRET || req.headers.get('x-internal-secret') !== INTERNAL_IMPORT_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (!API_KEY) {
    console.warn('[VERSIONS] Secret STREAMING_AVAILABILITY_API_KEY absent, rien à faire.');
    return jsonResponse({ success: false, raison: 'cle_api_absente' });
  }

  try {
    const { data: lot, error } = await supabase.rpc('series_a_verifier', { nb: LOT_PAR_JOUR });
    if (error) throw error;

    let verifiees = 0, echecs = 0, quotaEpuise = false;
    for (const { id, tmdb_id } of lot ?? []) {
      try {
        const resultat = await verifierSerie(tmdb_id);
        if (!resultat) { quotaEpuise = true; break; }
        const { error: erreurMaj } = await supabase
          .from('series')
          .update({ vf_disponible: resultat.vf, vostfr_disponible: resultat.vostfr, version_verifiee_at: new Date().toISOString() })
          .eq('id', id);
        if (erreurMaj) throw erreurMaj;
        verifiees++;
      } catch (err) {
        console.error(`[VERSIONS] Échec serie_id=${id}:`, (err as Error).message);
        echecs++;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[VERSIONS] ${verifiees} vérifiée(s), ${echecs} échec(s)${quotaEpuise ? ', quota épuisé' : ''}.`);
    return jsonResponse({ success: true, verifiees, echecs, quotaEpuise });
  } catch (err) {
    console.error('[VERSIONS] Erreur:', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
