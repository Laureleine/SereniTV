import { supabase } from '../supabase.js';
import { renderSeries, renderFetchError } from './ui/catalogRender.js';
import { getSavedSortOrder, saveSortOrder } from './ui/sortOrder.js';

let seriesData = [];

// ─────────────────────────────────────────────
// APPEL DES EDGE FUNCTIONS (le token TMDB et les écritures restent côté serveur)
// ─────────────────────────────────────────────
const EDGE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function callEdgeFunction(name, payload) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Session expirée, veuillez vous reconnecter.');

    const response = await fetch(`${EDGE_FUNCTIONS_URL}/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Erreur ${name} (HTTP ${response.status})`);
    return data;
}

// Durée du cache local avant re-synchro TMDB
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

// Identité de l'utilisateur connecté (Supabase Auth), fixée par setCurrentUserId()
// après une connexion réussie (voir ui/auth.js).
let currentUserId = null;

export function setCurrentUserId(id) {
    currentUserId = id;
}

export function getCurrentUserId() {
    return currentUserId;
}

// ─────────────────────────────────────────────
// LECTURE DU CATALOGUE
// ─────────────────────────────────────────────

export async function fetchSeries() {
    try {
        // LEFT JOIN propre sans filtrage bloquant au niveau PostgREST
        // pour conserver toutes les lignes parentes (inbox / non classées)
        const { data, error } = await supabase
            .from('series')
            .select(`
                *,
                utilisateur_series (
                    user_id,
                    statut_visionnage
                )
            `)
            .order('titre');

        if (error) throw error;

        // Aplatir et filtrer pour l'utilisateur courant sur le client
        seriesData = (data || []).map(s => {
            const userStatus = (s.utilisateur_series || []).find(us => us.user_id === getCurrentUserId());
            return {
                ...s,
                statut_visionnage: userStatus ? userStatus.statut_visionnage : null,
            };
        });

        applyFilters();
    } catch (error) {
        console.error('[FETCH] Erreur fetchSeries:', error);
        renderFetchError();
    }
}

// ─────────────────────────────────────────────
// COUCHE TMDB (proxifiée via Edge Function — le token TMDB reste côté serveur)
// ─────────────────────────────────────────────

/**
 * Cherche des séries sur TMDB par nom.
 * @param {string} query - Texte saisi par l'utilisateur
 * @returns {Promise<Array<{tmdbId, titre, annee, affiche_path, nb_saisons}>>}
 */
export async function rechercherSeriesTMDB(query) {
    if (!query || query.trim().length < 2) return [];
    return callEdgeFunction('tmdb-search', { query });
}

/**
 * Synchronise une série avec TMDB (fetch + upsert catalogue) via l'Edge Function `sync-serie`.
 * Le token TMDB et l'écriture en base restent côté serveur (service_role) — le client
 * n'a plus les droits d'écriture directs sur `series`/`saisons`.
 *
 * @param {number} tmdbId - ID TMDB à synchroniser
 * @returns {Promise<object>} La série Supabase à jour (avec ses saisons)
 */
export async function synchroniserSerieAvecTMDB(tmdbId) {
    return callEdgeFunction('sync-serie', { tmdbId });
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
export async function getSaisonsAvecStatut(serieId, userId = getCurrentUserId()) {
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
export async function aDejaUnSuiviSaisons(serieId, userId = getCurrentUserId()) {
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
export async function updateStatutUneSaison(saisonId, statut, userId = getCurrentUserId()) {
    try {
        await callEdgeFunction('update-user-status', { action: 'update_saison_statut', userId, saisonId, statut });
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
    userId = getCurrentUserId()
) {
    try {
        await callEdgeFunction('update-user-status', {
            action: 'apply_saisons_statuts',
            userId,
            serieId,
            numeroSaison,
            statutGlobal,
            statutSaisonPivot,
        });

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
export async function abandonnerSerie(serieId, numeroSaison, userId = getCurrentUserId()) {
    return appliquerStatutsSaisons(serieId, numeroSaison, 'Abandonnée', 'En cours', userId);
}

/**
 * Raccourci : Démarrage d'une nouvelle série "En cours".
 * Délègue à appliquerStatutsSaisons avec le statut global 'En cours'.
 */
export async function demarrerSerie(serieId, numeroSaison, userId = getCurrentUserId()) {
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
/**
 * Met à jour à chaud le statut d'une série dans l'état local en mémoire.
 */
export function updateLocalSeriesStatus(serieId, statut) {
    const idx = seriesData.findIndex(s => s.id === serieId);
    if (idx !== -1) {
        seriesData[idx].statut_visionnage = statut || null;
    }
}

export async function updateStatutGlobal(serieId, statutGlobal, userId = getCurrentUserId()) {
    const statutPrecedent = seriesData.find(s => s.id === serieId)?.statut_visionnage ?? null;

    try {
        console.log(`[STATUT] updateStatutGlobal — serie_id=${serieId}, statut=${statutGlobal}, user_id=${userId}`);

        // 1. Mise à jour immédiate optimiste de l'état local en mémoire
        updateLocalSeriesStatus(serieId, statutGlobal);
        applyFilters();

        // 2. Envoi asynchrone via l'Edge Function (écriture protégée côté serveur)
        await callEdgeFunction('update-user-status', {
            action: 'update_statut_global',
            userId,
            serieId,
            statut: statutGlobal,
        });

        console.log(`[STATUT] ✓ Statut global série ${serieId} → ${statutGlobal}.`);
        return { success: true };

    } catch (error) {
        console.error('[STATUT] Erreur updateStatutGlobal (catch):', error);

        // Rollback : l'écriture a échoué, on annule la mise à jour optimiste
        // pour ne pas laisser l'état local mentir sur ce qui est réellement enregistré.
        updateLocalSeriesStatus(serieId, statutPrecedent);
        applyFilters();

        return { success: false, error };
    }
}

// ─────────────────────────────────────────────
// RENOUVELLEMENT AUTOMATIQUE (nouvelle saison / fin de série confirmée)
// ─────────────────────────────────────────────

/**
 * Revérifie auprès de TMDB les séries "Suivies" ou "Terminée" dont le cache
 * date de plus de 7 jours (CACHE_TTL_MS), et bascule automatiquement leur
 * statut :
 *   - Nouvelle saison détectée (Suivies ou Terminée) → "En cours"
 *   - Suivies + production confirmée terminée par TMDB → "Terminée"
 * Conçu pour tourner une fois en tâche de fond au démarrage de l'app, sans
 * bloquer l'affichage initial. Chaque série est traitée indépendamment :
 * l'échec de l'une n'empêche pas les autres.
 * @param {string} userId
 */
export async function verifierRenouvellementSaisons(userId = getCurrentUserId()) {
    const seuil = new Date(Date.now() - CACHE_TTL_MS).toISOString();

    const { data: candidats, error } = await supabase
        .from('utilisateur_series')
        .select('serie_id, statut_visionnage, series!inner(tmdb_id, derniere_maj_tmdb)')
        .eq('user_id', userId)
        .in('statut_visionnage', ['Suivies', 'Terminée'])
        .lt('series.derniere_maj_tmdb', seuil);

    if (error) {
        console.error('[RENOUVELLEMENT] Erreur recherche des candidats:', error);
        return;
    }
    if (!candidats || candidats.length === 0) return;

    console.log(`[RENOUVELLEMENT] ${candidats.length} série(s) à revérifier auprès de TMDB…`);

    await Promise.allSettled(candidats.map(async (c) => {
        try {
            const tmdb = await synchroniserSerieAvecTMDB(c.series.tmdb_id);

            if (tmdb.nouvelleSaisonDetectee) {
                await updateStatutGlobal(c.serie_id, 'En cours', userId);
                console.log(`[RENOUVELLEMENT] ✓ Nouvelle saison détectée pour serie_id=${c.serie_id} → En cours.`);
            } else if (c.statut_visionnage === 'Suivies' && tmdb.statut_production === 'Terminée') {
                await updateStatutGlobal(c.serie_id, 'Terminée', userId);
                console.log(`[RENOUVELLEMENT] ✓ Série définitivement terminée pour serie_id=${c.serie_id} → Terminée.`);
            }
        } catch (err) {
            console.warn(`[RENOUVELLEMENT] Échec pour tmdb_id=${c.series.tmdb_id}:`, err.message);
        }
    }));
}

// ─────────────────────────────────────────────
// FILTRAGE DU CATALOGUE
// ─────────────────────────────────────────────

let currentStatusFilter = 'all';
let currentPlatformFilter = null; // 'Netflix' ou null
let currentSortOrder = getSavedSortOrder();
let dernierAjoutManuelId = null;

/**
 * Épingle une série (ajoutée manuellement) en tête de liste, quel que soit le tri choisi,
 * le temps que l'utilisateur la traite (elle quitte l'épingle dès qu'un statut lui est affecté).
 * @param {number} id
 */
export function marquerAjoutManuel(id) {
    dernierAjoutManuelId = id;
}

/**
 * Mélange Fisher-Yates : contrairement à sort((a,b) => Math.random()-0.5),
 * donne une permutation réellement équiprobable.
 */
function melangerAleatoirement(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Applique de manière combinée les filtres de statut de visionnage, de plateforme,
 * puis le tri choisi.
 */
export function applyFilters() {
    let filtered = seriesData;

    // 1. Filtrer par statut de visionnage (Toutes = Inbox / non classées)
    if (currentStatusFilter === 'all') {
        filtered = filtered.filter(s => s.statut_visionnage === null);
    } else {
        const map = {
            'en-cours':    'En cours',
            'suivies':     'Suivies',
            'a-voir':      'A voir',
            'terminees':   'Terminée',
            'abandonnees': 'Abandonnée',
            'peut-etre':   'Peut-être',
            'ignorees':    'Sans intérêt',
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

    // 3. Trier selon le mode choisi
    if (currentSortOrder === 'random') {
        filtered = melangerAleatoirement(filtered);
    } else {
        filtered = [...filtered].sort((a, b) => {
            if (currentSortOrder === 'recent') {
                return new Date(b.created_at) - new Date(a.created_at);
            }
            if (currentSortOrder === 'oldest') {
                return new Date(a.created_at) - new Date(b.created_at);
            }
            return a.titre.localeCompare(b.titre, 'fr');
        });
    }

    // 4. Épingle en tête le dernier ajout manuel, en tête quel que soit le tri
    if (dernierAjoutManuelId !== null) {
        const index = filtered.findIndex(s => s.id === dernierAjoutManuelId);
        if (index > 0) {
            filtered = [filtered[index], ...filtered.slice(0, index), ...filtered.slice(index + 1)];
        }
    }

    renderSeries(filtered);
}

/**
 * Change le tri du catalogue et le mémorise pour les prochaines visites.
 * @param {'alpha'|'recent'|'oldest'|'random'} order
 */
export function setSortOrder(order) {
    currentSortOrder = order;
    saveSortOrder(order);
    applyFilters();
}

export function getCurrentSortOrder() {
    return currentSortOrder;
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
 * Initialise l'écoute en temps réel (Supabase Realtime) des changements de statut, zapping et preview.
 * @param {Function} callback - Appelé à chaque modification détectée
 * @param {Function} onLaunchNetflix - Appelé lors de la réception du signal de lancement direct
 * @param {Function} onPreviewSeries - Appelé lors de la réception d'un signal de prévisualisation
 * @returns {object} Supabase Realtime channel
 */
export function initRealtimeZapping(callback, onLaunchNetflix, onPreviewSeries) {
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
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'series'
            },
            async (payload) => {
                console.log('[REALTIME] Changement détecté dans series:', payload);
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
        .on(
            'broadcast',
            { event: 'preview-series' },
            (payload) => {
                console.log('[REALTIME] Signal de prévisualisation reçu:', payload);
                if (onPreviewSeries) onPreviewSeries(payload.payload.series);
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

/**
 * Diffuse un message en temps réel pour ordonner à la télé d'afficher immédiatement la preview.
 * @param {object} series - Objet série complet
 */
export function diffuserSignalPreview(series) {
    if (!zappingChannel) {
        zappingChannel = supabase.channel('serenitv-zapping').subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                sendPreviewSignal(series);
            }
        });
    } else {
        sendPreviewSignal(series);
    }
}

function sendPreviewSignal(series) {
    zappingChannel.send({
        type: 'broadcast',
        event: 'preview-series',
        payload: { series: series },
    });
    console.log('[REALTIME] Signal de prévisualisation diffusé:', series ? series.titre : 'null (clear)');
}