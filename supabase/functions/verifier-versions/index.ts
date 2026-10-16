import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Appelée uniquement par le cron pg_cron « verifier-versions » (1 fois par
// jour), gardée par le secret interne serveur-à-serveur des autres crons.
//
// Pour un lot de séries (ordre de priorité calculé par la fonction SQL
// series_a_verifier), interroge l'API Streaming Availability (Movie of the
// Night) et enregistre si une VF et/ou une VOSTFR existe en France sur une
// offre par abonnement, gratuite ou « chaîne » en option (location/achat
// ignorés), ainsi que le lien direct et la date de départ de la plateforme.
// La réponse complète est conservée dans series_streaming. Le quota gratuit
// est de 1000 requêtes/mois (plafond dur) : on en consomme au plus
// LOT_PAR_JOUR par jour.
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

type Resultat = {
  statut: number;
  reponse: unknown;
  vf: boolean;
  vostfr: boolean;
  lien: string | null;
  lienService: string | null;
  departLe: string | null;
  departService: string | null;
};

/** Date d'expiration de l'API (timestamp Unix en secondes, ou date texte) → ISO. */
function versIso(valeur: unknown): string | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const date = typeof valeur === 'number' ? new Date(valeur * 1000) : new Date(String(valeur));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** null si le quota est épuisé (on arrête le lot), sinon le résultat complet. */
async function verifierSerie(tmdbId: number, plateformeConnue: string | null): Promise<Resultat | null> {
  const response = await fetch(`${API_URL}/tv/${tmdbId}?country=fr`, {
    headers: { 'X-API-Key': API_KEY! },
  });
  if (response.status === 429) return null;
  // Série inconnue de l'API : on la marque vérifiée (rien de disponible) pour
  // ne pas la redemander chaque jour.
  if (response.status === 404) {
    return { statut: 404, reponse: null, vf: false, vostfr: false, lien: null, lienService: null, departLe: null, departService: null };
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} pour tv/${tmdbId}`);

  const show = await response.json();
  const offres = (show.streamingOptions?.fr ?? []).filter((o: any) => TYPES_RETENUS.has(o.type));

  // Offre de référence (lien direct + date de départ) : celle de la plateforme
  // déjà affichée sur la carte si elle existe, sinon la première retenue.
  const nomService = (o: any) => String(o.service?.name ?? o.service?.id ?? '');
  const plateforme = (plateformeConnue ?? '').toLowerCase();
  const reference = (plateforme && offres.find((o: any) => {
    const nom = nomService(o).toLowerCase();
    return nom && (nom.includes(plateforme) || plateforme.includes(nom));
  })) || offres[0];

  return {
    statut: 200,
    reponse: show,
    vf: offres.some((o: any) => (o.audios ?? []).some(estFrancais)),
    vostfr: offres.some((o: any) => (o.subtitles ?? []).some((s: any) => estFrancais(s.locale))),
    lien: reference?.link ?? null,
    lienService: reference ? nomService(reference) || null : null,
    departLe: reference ? versIso(reference.expiresOn) : null,
    departService: reference?.expiresOn ? nomService(reference) || null : null,
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
    for (const { id, tmdb_id, plateforme } of lot ?? []) {
      try {
        const resultat = await verifierSerie(tmdb_id, plateforme);
        if (!resultat) { quotaEpuise = true; break; }
        const maintenant = new Date().toISOString();

        // Réponse brute conservée intégralement (usages futurs).
        const { error: erreurBrut } = await supabase
          .from('series_streaming')
          .upsert({ serie_id: id, statut_http: resultat.statut, reponse: resultat.reponse, recu_at: maintenant });
        if (erreurBrut) throw erreurBrut;

        const { error: erreurMaj } = await supabase
          .from('series')
          .update({
            vf_disponible: resultat.vf,
            vostfr_disponible: resultat.vostfr,
            lien_plateforme: resultat.lien,
            lien_plateforme_service: resultat.lienService,
            depart_le: resultat.departLe,
            depart_service: resultat.departService,
            version_verifiee_at: maintenant,
          })
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
