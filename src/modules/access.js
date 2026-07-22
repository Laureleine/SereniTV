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
