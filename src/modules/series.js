import { supabase } from '../supabase.js';
import { renderSeries } from './ui.js';

let seriesData = [];

// ─────────────────────────────────────────────
// CONFIGURATION TMDB (via variables d'environnement Vite)
// ─────────────────────────────────────────────
const TMDB_BASE_URL    = 'https://api.themoviedb.org/3';
const TMDB_ACCESS_TOKEN = import.meta.env.VITE_TMDB_ACCESS_TOKEN;
// On préfère le Bearer token (plus sécurisé) à la query-param api_key
const TMDB_HEADERS = {
    'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
    'Content-Type':  'application/json',
};

// Durée du cache local avant re-synchro TMDB
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/**
 * Mappe le statut brut TMDB vers nos valeurs métier.
 * @param {string} tmdbStatus
 * @returns {'En cours' | 'Terminée'}
 */
function mapperStatutTMDB(tmdbStatus) {
    return (tmdbStatus === 'Ended' || tmdbStatus === 'Canceled') ? 'Terminée' : 'En cours';
}

// UUID simulé en attendant l'authentification Supabase Auth
export const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

// ─────────────────────────────────────────────
// LECTURE DU CATALOGUE
// ─────────────────────────────────────────────

export async function fetchSeries() {
    try {
        // Jointure avec utilisateur_series pour récupérer le statut de visionnage
        // en une seule requête (pas de N+1).
        const { data, error } = await supabase
            .from('series')
            .select(`
                *,
                utilisateur_series!left (
                    statut_visionnage
                )
            `)
            .eq('utilisateur_series.user_id', MOCK_USER_ID)
            .order('titre');

        if (error) throw error;

        // Aplatir : remonter statut_visionnage directement sur l'objet série
        seriesData = (data || []).map(s => ({
            ...s,
            statut_visionnage: s.utilisateur_series?.[0]?.statut_visionnage ?? null,
        }));

        renderSeries(seriesData);
    } catch (error) {
        console.error('[FETCH] Erreur fetchSeries:', error);
    }
}

// ─────────────────────────────────────────────
// COUCHE TMDB
// ─────────────────────────────────────────────

/**
 * Appelle l'API TMDB pour une série et retourne les données brutes normalisées.
 * Lève une exception si l'API est indisponible ou renvoie une erreur.
 * @param {number} tmdbId - ID TMDB de la série
 * @returns {Promise<{titre, synopsis, statut_production, saisons: Array}>}
 */
async function fetchTMDB(tmdbId) {
    const url = `${TMDB_BASE_URL}/tv/${tmdbId}?language=fr-FR&append_to_response=watch/providers`;
    const response = await fetch(url, { headers: TMDB_HEADERS });

    if (!response.ok) {
        throw new Error(`[TMDB] Erreur HTTP ${response.status} pour tmdb_id=${tmdbId}`);
    }

    const d = await response.json();

    const providers = d["watch/providers"]?.results?.FR;
    const hasNetflix = providers && (providers.flatrate || []).some(
        p => p.provider_name && p.provider_name.toLowerCase().includes('netflix')
    );
    const watchUrl = hasNetflix ? (providers.link || null) : null;

    return {
        titre:             d.name,
        // Fallback sur la version originale si pas de traduction FR
        synopsis:          d.overview || d.original_name,
        affiche_path:      d.poster_path,
        backdrop_path:     d.backdrop_path,
        statut_production: mapperStatutTMDB(d.status),
        plateforme:        d.networks?.[0]?.name || null,
        watch_url:         watchUrl,
        // On filtre la saison 0 (Spéciaux / Making-of) qui n'a pas de valeur métier
        saisons: (d.seasons || [])
            .filter(s => s.season_number > 0)
            .map(s => ({
                numero_saison:   s.season_number,
                nombre_episodes: s.episode_count,
            })),
    };
}

/**
 * Cherche des séries sur TMDB par nom (endpoint /search/tv).
 * Retourne un tableau de suggestions prêtes pour l'affichage.
 * @param {string} query - Texte saisi par l'utilisateur
 * @returns {Promise<Array<{tmdbId, titre, annee, affiche_path, nb_saisons}>>}
 */
export async function rechercherSeriesTMDB(query) {
    if (!query || query.trim().length < 2) return [];

    const url = `${TMDB_BASE_URL}/search/tv?query=${encodeURIComponent(query)}&language=fr-FR&page=1`;
    const response = await fetch(url, { headers: TMDB_HEADERS });

    if (!response.ok) {
        throw new Error(`[TMDB Search] Erreur HTTP ${response.status}`);
    }

    const data = await response.json();

    // On prend les 7 premiers résultats pertinents (avec au moins un titre)
    return (data.results || [])
        .filter(r => r.name && r.id)
        .slice(0, 7)
        .map(r => ({
            tmdbId:       r.id,
            titre:        r.name,
            titre_orig:   r.original_name !== r.name ? r.original_name : null,
            annee:        r.first_air_date ? r.first_air_date.slice(0, 4) : '—',
            affiche_path: r.poster_path,
            popularite:   r.popularity,
        }));
}

/**
 * Synchronise une série avec TMDB : upsert dans `series` + upsert en masse dans `saisons`.
 * Peut être appelée pour une série déjà connue (rafraîchissement) ou une toute nouvelle.
 *
 * @param {number} tmdbId - ID TMDB à synchroniser
 * @returns {Promise<object>} La série Supabase à jour (avec ses saisons)
 */
export async function synchroniserSerieAvecTMDB(tmdbId) {
    // 1. Récupération des données fraîches depuis TMDB
    const tmdb = await fetchTMDB(tmdbId);
    const now  = new Date().toISOString();

    // 2. Upsert de la série dans notre catalogue
    //    onConflict sur tmdb_id → INSERT si nouvelle, UPDATE si existante
    const { data: serieUpserted, error: serieError } = await supabase
        .from('series')
        .upsert(
            {
                tmdb_id:           tmdbId,
                titre:             tmdb.titre,
                synopsis:          tmdb.synopsis,
                affiche_path:      tmdb.affiche_path,
                backdrop_path:     tmdb.backdrop_path,
                statut_production: tmdb.statut_production,
                plateforme:        tmdb.plateforme,
                watch_url:         tmdb.watch_url,
                derniere_maj_tmdb: now,
            },
            { onConflict: 'tmdb_id' }
        )
        .select('id')
        .single();

    if (serieError) throw serieError;

    const serieId = serieUpserted.id;

    // 3. Récupérer les saisons locales actuelles pour la comparaison
    const { data: saisonsLocales } = await supabase
        .from('saisons')
        .select('id, numero_saison, nombre_episodes')
        .eq('serie_id', serieId);

    const localesMap = new Map((saisonsLocales || []).map(s => [s.numero_saison, s]));

    // 4. Construire le payload d'upsert uniquement pour les saisons nouvelles ou modifiées
    //    (optimisation : évite de ré-écrire des lignes inchangées)
    const saisonsPayload = tmdb.saisons.reduce((acc, s) => {
        const locale = localesMap.get(s.numero_saison);
        if (!locale || locale.nombre_episodes !== s.nombre_episodes) {
            acc.push({
                ...(locale && { id: locale.id }), // conserve l'id pour forcer un UPDATE
                serie_id:        serieId,
                numero_saison:   s.numero_saison,
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
        console.log(`[TMDB] ✓ ${saisonsPayload.length} saison(s) synchronisée(s) pour tmdb_id=${tmdbId}.`);
    } else {
        console.log(`[TMDB] ✓ Saisons déjà à jour pour tmdb_id=${tmdbId}.`);
    }

    // 5. Retourner la série complète (fraîche depuis Supabase, avec ses saisons)
    const { data: serieComplete, error: reloadError } = await supabase
        .from('series')
        .select('*, saisons (*)')
        .eq('id', serieId)
        .single();

    if (reloadError) throw reloadError;
    return serieComplete;
}

/**
 * Point d'entrée pour afficher le détail d'une série.
 *
 * Logique de cache hybride à 7 jours :
 *
 *  ┌─ Série connue en base ?
 *  │     NON  → synchroniserSerieAvecTMDB() en mode BLOQUANT (premier chargement)
 *  │     OUI  →
 *  │           ┌─ Cache valide (< 7 jours) ou série Terminée ?
 *  │           │     OUI → retour immédiat des données locales
 *  │           │     NON → retour immédiat des données locales
 *  │           │           + synchroniserSerieAvecTMDB() lancé en TÂCHE DE FOND
 *  │           │             (l'UI se met à jour à la prochaine ouverture)
 *  └───────────────────────────────────────────────────────────
 *
 * @param {number} tmdbId
 * @returns {Promise<object|null>}
 */
export async function getHybridSerieData(tmdbId) {
    try {
        // 1. Chercher la série dans le cache local (Supabase)
        const { data: serie, error } = await supabase
            .from('series')
            .select('*, saisons (*)')
            .eq('tmdb_id', tmdbId)
            .maybeSingle(); // maybeSingle() renvoie null sans erreur si absent

        if (error) throw error;

        // ── Cas A : Série inconnue → premier chargement BLOQUANT ──────────────
        if (!serie) {
            console.log(`[CACHE] Série tmdb_id=${tmdbId} absente — synchronisation initiale…`);
            return await synchroniserSerieAvecTMDB(tmdbId);
        }

        // ── Cas B : Série connue — vérification du cache ──────────────────────
        const cacheAge   = Date.now() - new Date(serie.derniere_maj_tmdb).getTime();
        const cacheValide = cacheAge <= CACHE_TTL_MS || serie.statut_production === 'Terminée';

        if (cacheValide) {
            // Cache frais ou série terminée (ne bougera plus) → données locales
            console.log(`[CACHE] ✓ Données locales utilisées pour « ${serie.titre} ».`);
            return serie;
        }

        // ── Cas C : Cache périmé → retour immédiat + refresh en tâche de fond ─
        console.log(`[CACHE] Cache périmé pour « ${serie.titre} » — refresh en arrière-plan…`);

        // Promise non-awaited : l'UI n'attend pas, la synchro se fait silencieusement
        synchroniserSerieAvecTMDB(tmdbId).catch(err =>
            console.warn('[CACHE] Refresh arrière-plan échoué (mode hors-ligne ?):', err.message)
        );

        // On retourne les données locales immédiatement
        return serie;

    } catch (err) {
        console.error('[TMDB] Erreur getHybridSerieData — détails complets :', err);
        return null;
    }
}

// ─────────────────────────────────────────────
// GESTION DES STATUTS UTILISATEUR
// ─────────────────────────────────────────────

/**
 * Récupère les saisons d'une série avec leur statut utilisateur courant.
 * @param {number} serieId
 * @param {string} userId
 * @returns {Promise<Array>} Tableau de saisons enrichi du statut utilisateur
 */
export async function getSaisonsAvecStatut(serieId, userId = MOCK_USER_ID) {
    let { data: saisons, error } = await supabase
        .from('saisons')
        .select(`
            *,
            utilisateur_saisons!left (statut_saison, dernier_episode_vu)
        `)
        .eq('serie_id', serieId)
        .eq('utilisateur_saisons.user_id', userId)
        .order('numero_saison');

    if (error) throw error;

    // JIT Sync: Si aucune saison n'est présente localement, on synchronise depuis TMDB
    if (!saisons || saisons.length === 0) {
        const { data: serie } = await supabase
            .from('series')
            .select('tmdb_id')
            .eq('id', serieId)
            .single();

        if (serie && serie.tmdb_id) {
            console.log(`[JIT SYNC] Chargement des saisons à la volée pour tmdb_id=${serie.tmdb_id}...`);
            try {
                await synchroniserSerieAvecTMDB(serie.tmdb_id);
                // On récupère à nouveau les saisons après la synchronisation
                const res = await supabase
                    .from('saisons')
                    .select(`
                        *,
                        utilisateur_saisons!left (statut_saison, dernier_episode_vu)
                    `)
                    .eq('serie_id', serieId)
                    .eq('utilisateur_saisons.user_id', userId)
                    .order('numero_saison');
                
                if (res.error) throw res.error;
                saisons = res.data;
            } catch (err) {
                console.error('[JIT SYNC] Échec de la synchronisation à la volée:', err);
            }
        }
    }

    return saisons || [];
}

/**
 * Vérifie si l'utilisateur a déjà un suivi de saisons pour cette série.
 * Sert à décider si "En cours" doit ouvrir le modal ou juste mettre à jour le statut global.
 * @param {number} serieId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function aDejaUnSuiviSaisons(serieId, userId = MOCK_USER_ID) {
    // Jointure : on cherche des lignes utilisateur_saisons liées aux saisons de cette série
    const { data, error } = await supabase
        .from('utilisateur_saisons')
        .select('id, saisons!inner(serie_id)')
        .eq('user_id', userId)
        .eq('saisons.serie_id', serieId)
        .limit(1);

    if (error) {
        console.error("[SUIVI] Erreur vérification suivi saisons:", error);
        return false;
    }
    return data && data.length > 0;
}

/**
 * Met à jour (ou crée) le statut d'une saison individuelle pour un utilisateur.
 * Utilisé par le panneau de détail de la carte de série.
 * @param {number} saisonId  - ID Supabase de la saison
 * @param {string} statut    - 'Pas commencée' | 'En cours' | 'Terminée'
 * @param {string} userId
 * @returns {Promise<{success: boolean, error?: any}>}
 */
export async function updateStatutUneSaison(saisonId, statut, userId = MOCK_USER_ID) {
    try {
        const { error } = await supabase
            .from('utilisateur_saisons')
            .upsert(
                { user_id: userId, saison_id: saisonId, statut_saison: statut },
                { onConflict: 'user_id, saison_id' }
            );

        if (error) throw error;

        console.log(`[SAISON] ✓ Saison ${saisonId} → ${statut}`);
        return { success: true };
    } catch (err) {
        console.error('[SAISON] Erreur updateStatutUneSaison:', err);
        return { success: false, error: err };
    }
}


/**
 * Cinématique générique de mise à jour des statuts de saisons.
 * Utilisée à la fois pour "Abandonnée" et "En cours (nouvelle série)".
 *
 * Distribution des statuts autour de la saison X choisie :
 *   - Saisons < X  → 'Terminée'
 *   - Saison  = X  → statutSaisonPivot (paramétrable)
 *   - Saisons > X  → 'Pas commencée'
 *
 * @param {number} serieId
 * @param {number} numeroSaison    - Numéro de la saison pivot
 * @param {string} statutGlobal    - Statut à écrire dans utilisateur_series ('Abandonnée' | 'En cours')
 * @param {string} statutSaisonPivot - Statut de la saison X elle-même ('En cours')
 * @param {string} userId
 * @returns {Promise<{success: boolean, error?: any}>}
 */
export async function appliquerStatutsSaisons(
    serieId,
    numeroSaison,
    statutGlobal,
    statutSaisonPivot = 'En cours',
    userId = MOCK_USER_ID
) {
    try {
        // 1. Récupérer toutes les saisons du catalogue
        const { data: saisons, error: saisonsError } = await supabase
            .from('saisons')
            .select('id, numero_saison')
            .eq('serie_id', serieId)
            .order('numero_saison');

        if (saisonsError) throw saisonsError;
        if (!saisons || saisons.length === 0) throw new Error("Aucune saison trouvée.");

        // 2. Construire le payload en une seule passe
        const saisonsPayload = saisons.map(saison => ({
            user_id:   userId,
            saison_id: saison.id,
            statut_saison:
                saison.numero_saison < numeroSaison  ? 'Terminée'
              : saison.numero_saison === numeroSaison ? statutSaisonPivot
              : 'Pas commencée',
        }));

        // 3. Upsert en masse — une seule requête HTTP
        const { error: upsertError } = await supabase
            .from('utilisateur_saisons')
            .upsert(saisonsPayload, { onConflict: 'user_id, saison_id' });

        if (upsertError) throw upsertError;

        // 4. Mise à jour du statut global de la série
        const { error: serieError } = await supabase
            .from('utilisateur_series')
            .upsert(
                {
                    user_id:           userId,
                    serie_id:          serieId,
                    statut_visionnage: statutGlobal,
                    updated_at:        new Date().toISOString(),
                },
                { onConflict: 'user_id, serie_id' }
            );

        if (serieError) throw serieError;

        console.log(`[STATUT] ✓ Série ${serieId} → ${statutGlobal} (pivot saison ${numeroSaison}).`);
        return { success: true };

    } catch (error) {
        console.error("[STATUT] Erreur:", error);
        return { success: false, error };
    }
}

/**
 * Raccourci : Abandon d'une série.
 * Délègue à appliquerStatutsSaisons avec le statut global 'Abandonnée'.
 */
export async function abandonnerSerie(serieId, numeroSaison, userId = MOCK_USER_ID) {
    return appliquerStatutsSaisons(serieId, numeroSaison, 'Abandonnée', 'En cours', userId);
}

/**
 * Raccourci : Démarrage d'une nouvelle série "En cours".
 * Délègue à appliquerStatutsSaisons avec le statut global 'En cours'.
 */
export async function demarrerSerie(serieId, numeroSaison, userId = MOCK_USER_ID) {
    return appliquerStatutsSaisons(serieId, numeroSaison, 'En cours', 'En cours', userId);
}

/**
 * Reprise simple : l'utilisateur a déjà un suivi de saisons.
 * On met uniquement à jour le statut global sans toucher aux saisons.
 * @param {number} serieId
 * @param {string} statutGlobal
 * @param {string} userId
 * @returns {Promise<{success: boolean, error?: any}>}
 */
export async function updateStatutGlobal(serieId, statutGlobal, userId = MOCK_USER_ID) {
    try {
        console.log(`[STATUT] updateStatutGlobal — serie_id=${serieId}, statut=${statutGlobal}, user_id=${userId}`);

        const { data, error } = await supabase
            .from('utilisateur_series')
            .upsert(
                {
                    user_id:           userId,
                    serie_id:          serieId,
                    statut_visionnage: statutGlobal,
                    updated_at:        new Date().toISOString(),
                },
                { onConflict: 'user_id, serie_id' }
            )
            .select();

        if (error) throw error;

        console.log(`[STATUT] ✓ Statut global série ${serieId} → ${statutGlobal}.`);
        return { success: true };

    } catch (error) {
        console.error('[STATUT] Erreur updateStatutGlobal (catch):', error);
        return { success: false, error };
    }
}

// ─────────────────────────────────────────────
// FILTRAGE DU CATALOGUE
// ─────────────────────────────────────────────

let currentStatusFilter = 'all';
let currentPlatformFilter = null; // 'Netflix' ou null

/**
 * Applique de manière combinée les filtres de statut de visionnage et de plateforme.
 */
export function applyFilters() {
    let filtered = seriesData;

    // 1. Filtrer par statut de visionnage (ou boîte de réception)
    if (currentStatusFilter === 'all') {
        filtered = filtered.filter(s => s.statut_visionnage === null);
    } else {
        const map = {
            'en-cours':    'En cours',
            'a-voir':      'A voir',
            'terminees':   'Terminée',
            'abandonnees': 'Abandonnée',
        };
        const cible = map[currentStatusFilter];
        if (cible) {
            filtered = filtered.filter(s => s.statut_visionnage === cible);
        }
    }

    // 2. Filtrer par plateforme si sélectionnée
    if (currentPlatformFilter) {
        filtered = filtered.filter(s => s.plateforme && s.plateforme.toLowerCase() === currentPlatformFilter.toLowerCase());
    }

    renderSeries(filtered);
}

export function filterSeries(filter) {
    currentStatusFilter = filter;
    applyFilters();
}

/**
 * Active/Désactive le filtrage par plateforme (Netflix, etc.).
 * @param {string|null} platform
 */
export function setPlatformFilter(platform) {
    currentPlatformFilter = platform;
    applyFilters();
}

export let zappingChannel = null;

/**
 * Initialise l'écoute en temps réel (Supabase Realtime) des changements de statut et du zapping.
 * @param {Function} callback - Appelé à chaque modification détectée
 * @param {Function} onLaunchNetflix - Appelé lors de la réception du signal de lancement direct
 * @returns {object} Supabase Realtime channel
 */
export function initRealtimeZapping(callback, onLaunchNetflix) {
    zappingChannel = supabase
        .channel('serenitv-zapping')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'utilisateur_series'
            },
            async (payload) => {
                console.log('[REALTIME] Changement détecté dans utilisateur_series:', payload);
                // On recharge les séries locales pour avoir la donnée fraîche
                await fetchSeries();
                // On notifie le callback (l'UI)
                if (callback) callback(payload);
            }
        )
        .on(
            'broadcast',
            { event: 'launch-netflix' },
            (payload) => {
                console.log('[REALTIME] Signal de lancement reçu:', payload);
                if (onLaunchNetflix) onLaunchNetflix(payload.payload.watch_url);
            }
        )
        .subscribe((status) => {
            console.log('[REALTIME] Statut de la souscription Realtime:', status);
        });

    return zappingChannel;
}

/**
 * Diffuse un message en temps réel via les canaux de diffusion Supabase (Broadcast)
 * pour ordonner à la télé d'ouvrir directement la série Netflix correspondante.
 * @param {string} watchUrl - Le lien de visionnage
 */
export function diffuserSignalLancement(watchUrl) {
    if (!zappingChannel) {
        zappingChannel = supabase.channel('serenitv-zapping').subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                sendBroadcastSignal(watchUrl);
            }
        });
    } else {
        sendBroadcastSignal(watchUrl);
    }
}

function sendBroadcastSignal(watchUrl) {
    zappingChannel.send({
        type: 'broadcast',
        event: 'launch-netflix',
        payload: { watch_url: watchUrl },
    });
    console.log('[REALTIME] Signal de lancement diffusé:', watchUrl);
}