import { supabase } from '../supabase.js';

const EDGE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Appelle une Edge Function Supabase avec le token de la session courante.
 * @param {string} name
 * @param {object} payload
 * @returns {Promise<any>}
 */
export async function callEdgeFunction(name, payload) {
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
