import { supabase } from '../../supabase.js';
import { setCurrentUserId } from '../series.js';

/**
 * Gère l'écran de connexion : affiche le formulaire si aucune session n'est
 * active, sinon reprend directement la session existante. Appelle
 * onAuthenticated(userId) une fois connecté (session déjà active ou après
 * connexion réussie).
 * @param {(userId: string) => void} onAuthenticated
 */
export async function initAuth(onAuthenticated) {
    const overlay      = document.getElementById('auth-overlay');
    const form         = document.getElementById('auth-form');
    const emailInput   = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const errorEl      = document.getElementById('auth-error');
    const submitBtn    = document.getElementById('auth-submit');

    if (!overlay || !form) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        overlay.classList.add('hidden');
        setCurrentUserId(session.user.id);
        onAuthenticated(session.user.id);
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Connexion…';

        const { data, error } = await supabase.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value,
        });

        submitBtn.disabled = false;
        submitBtn.textContent = 'Se connecter';

        if (error || !data.session) {
            errorEl.textContent = 'Email ou mot de passe incorrect.';
            errorEl.hidden = false;
            return;
        }

        overlay.classList.add('hidden');
        setCurrentUserId(data.session.user.id);
        onAuthenticated(data.session.user.id);
    });
}
