import { supabase } from '../supabase.js';
import { callEdgeFunction } from './edgeFunctions.js';
import { getCurrentUserId } from './series.js';

export const OWNER_ID = 'e062f101-98f4-4d4f-818f-134add366f28';

export function estProprietaire() {
    return getCurrentUserId() === OWNER_ID;
}

/**
 * Inscrit un nouveau compte (bêta privée) avec une motivation optionnelle.
 * @returns {Promise<{success: boolean, session: object|null, error?: any}>}
 */
export async function inscrireCompte(email, password, motivation) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { motivation: motivation || null } },
    });
    if (error) return { success: false, session: null, error };
    return { success: true, session: data.session };
}

/**
 * Récupère le profil d'accès de l'utilisateur connecté.
 * @returns {Promise<object|null>}
 */
export async function getMonProfil() {
    const { data, error } = await supabase
        .from('profils_utilisateurs')
        .select('*')
        .eq('id', getCurrentUserId())
        .maybeSingle();
    if (error) {
        console.error('[ACCES] Erreur getMonProfil:', error);
        return null;
    }
    return data;
}

/**
 * Liste les inscriptions en attente de validation (réservé au propriétaire —
 * la RLS garantit qu'un autre compte ne verrait de toute façon que sa propre ligne).
 */
export async function fetchProfilsEnAttente() {
    const { data, error } = await supabase
        .from('profils_utilisateurs')
        .select('*')
        .eq('statut_acces', 'en_attente')
        .order('created_at');
    if (error) {
        console.error('[ACCES] Erreur fetchProfilsEnAttente:', error);
        return [];
    }
    return data || [];
}

export async function approuverUtilisateur(targetUserId) {
    try {
        await callEdgeFunction('manage-user-access', { action: 'approve', targetUserId });
        return { success: true };
    } catch (error) {
        console.error('[ACCES] Erreur approuverUtilisateur:', error);
        return { success: false, error };
    }
}

export async function refuserUtilisateur(targetUserId) {
    try {
        await callEdgeFunction('manage-user-access', { action: 'reject', targetUserId });
        return { success: true };
    } catch (error) {
        console.error('[ACCES] Erreur refuserUtilisateur:', error);
        return { success: false, error };
    }
}

/**
 * Liste tous les retours (feedback), visibles par tout compte authentifié.
 */
export async function fetchFeedback() {
    const { data, error } = await supabase
        .from('retours_utilisateurs')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[FEEDBACK] Erreur fetchFeedback:', error);
        return [];
    }
    return data || [];
}

export async function soumettreFeedback(type, titre, description) {
    try {
        const data = await callEdgeFunction('submit-feedback', { type, titre, description });
        return { success: true, retour: data.retour };
    } catch (error) {
        console.error('[FEEDBACK] Erreur soumettreFeedback:', error);
        return { success: false, error };
    }
}

export async function changerStatutFeedback(feedbackId, statut) {
    try {
        await callEdgeFunction('manage-feedback', { feedbackId, statut });
        return { success: true };
    } catch (error) {
        console.error('[FEEDBACK] Erreur changerStatutFeedback:', error);
        return { success: false, error };
    }
}

/**
 * Récupère les réglages admin (notification par email des nouvelles inscriptions).
 * @returns {Promise<{notifier_nouvelles_inscriptions: boolean}|null>}
 */
export async function getParametresAdmin() {
    const { data, error } = await supabase
        .from('parametres_admin')
        .select('notifier_nouvelles_inscriptions')
        .eq('id', 1)
        .maybeSingle();
    if (error) {
        console.error('[ADMIN] Erreur getParametresAdmin:', error);
        return null;
    }
    return data;
}

/**
 * Active/désactive la notification par email à chaque nouvelle inscription.
 * Réservé au propriétaire (RLS).
 */
export async function setNotifierNouvellesInscriptions(actif) {
    const { error } = await supabase
        .from('parametres_admin')
        .update({ notifier_nouvelles_inscriptions: actif })
        .eq('id', 1);
    if (error) {
        console.error('[ADMIN] Erreur setNotifierNouvellesInscriptions:', error);
        return { success: false, error };
    }
    return { success: true };
}

/**
 * Enregistre une visite de la landing page (silencieux en cas d'échec —
 * ne doit jamais bloquer ni perturber l'affichage du visiteur).
 * @param {boolean} connu - true si une session active existe déjà
 * @param {string|null} userId
 */
export async function enregistrerVisiteLanding(connu, userId = null) {
    const { error } = await supabase.from('landing_visites').insert({ connu, user_id: userId });
    if (error) console.error('[STATS] Erreur enregistrerVisiteLanding:', error);
}

/**
 * Statistiques de visites de la landing page (réservé au propriétaire, RLS).
 * @returns {Promise<{total: number, connus: number, autres: number}|null>}
 */
export async function getStatsVisites() {
    const { data, error } = await supabase
        .from('landing_visites')
        .select('connu');
    if (error) {
        console.error('[STATS] Erreur getStatsVisites:', error);
        return null;
    }
    const total = data.length;
    const connus = data.filter(v => v.connu).length;
    return { total, connus, autres: total - connus };
}

/**
 * Liste tous les commentaires de tous les retours (le fil de discussion par
 * carte), visibles par tout compte authentifié.
 */
export async function fetchCommentaires() {
    const { data, error } = await supabase
        .from('retours_commentaires')
        .select('*')
        .order('created_at');
    if (error) {
        console.error('[FEEDBACK] Erreur fetchCommentaires:', error);
        return [];
    }
    return data || [];
}

/**
 * Ajoute une réponse (propriétaire uniquement, RLS) sur le fil d'une carte.
 */
export async function ajouterCommentaire(retourId, message) {
    const { error } = await supabase
        .from('retours_commentaires')
        .insert({ retour_id: retourId, auteur: 'utilisateur', message });
    if (error) {
        console.error('[FEEDBACK] Erreur ajouterCommentaire:', error);
        return { success: false, error };
    }
    return { success: true };
}
