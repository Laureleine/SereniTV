import { supabase } from '../../supabase.js';
import { setCurrentUserId } from '../series.js';
import { inscrireCompte, getMonProfil, enregistrerVisiteLanding } from '../access.js';
import { ouvrirChangelog } from './changelog.js';

let mode = 'login'; // 'login' | 'signup'

/**
 * Gère tout le parcours public avant l'appli : landing → connexion/inscription
 * → attente de validation → appli. Appelle onAuthenticated(userId) une fois
 * qu'une session existe ET que le compte est approuvé (statut_acces = 'valide').
 * @param {(userId: string) => void} onAuthenticated
 */
export async function initAuth(onAuthenticated) {
    const landing     = document.getElementById('landing-screen');
    const overlay     = document.getElementById('auth-overlay');
    const pendingScreen = document.getElementById('pending-screen');
    const refusedScreen = document.getElementById('refused-screen');
    const form        = document.getElementById('auth-form');
    const subtitle    = document.getElementById('auth-subtitle');
    const emailInput  = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const motivationInput = document.getElementById('auth-motivation');
    const toggleBtn   = document.getElementById('auth-toggle-mode');
    const errorEl     = document.getElementById('auth-error');
    const successEl   = document.getElementById('auth-success');
    const submitBtn   = document.getElementById('auth-submit');

    if (!overlay || !form) return;

    const hideAllPortalScreens = () => {
        landing?.classList.add('hidden');
        overlay.classList.add('hidden');
        pendingScreen?.classList.add('hidden');
        refusedScreen?.classList.add('hidden');
    };

    const setMode = (newMode) => {
        mode = newMode;
        errorEl.hidden = true;
        successEl.hidden = true;
        if (mode === 'signup') {
            subtitle.textContent = 'Créer un compte';
            motivationInput.hidden = false;
            submitBtn.textContent = "S'inscrire";
            toggleBtn.textContent = 'Déjà un compte ? Se connecter';
        } else {
            subtitle.textContent = 'Connexion';
            motivationInput.hidden = true;
            submitBtn.textContent = 'Se connecter';
            toggleBtn.textContent = 'Pas encore de compte ? Rejoindre la bêta';
        }
    };

    const showAuthOverlay = (initialMode) => {
        hideAllPortalScreens();
        setMode(initialMode);
        overlay.classList.remove('hidden');
    };

    /**
     * Décide de l'écran à afficher une fois une session active : attente,
     * refusé, ou accès à l'appli.
     */
    const gererApresConnexion = async (userId) => {
        setCurrentUserId(userId);
        const profil = await getMonProfil();

        if (!profil || profil.statut_acces === 'en_attente') {
            hideAllPortalScreens();
            pendingScreen?.classList.remove('hidden');
            return;
        }
        if (profil.statut_acces === 'refuse') {
            hideAllPortalScreens();
            refusedScreen?.classList.remove('hidden');
            return;
        }

        hideAllPortalScreens();
        onAuthenticated(userId);
    };

    // ── Landing : navigation ──
    document.getElementById('landing-nav-login')?.addEventListener('click', () => showAuthOverlay('login'));
    document.getElementById('landing-nav-signup')?.addEventListener('click', () => showAuthOverlay('signup'));
    document.getElementById('landing-cta-signup')?.addEventListener('click', () => showAuthOverlay('signup'));
    document.getElementById('landing-nav-changelog')?.addEventListener('click', () => ouvrirChangelog());
    document.getElementById('landing-nav-faq')?.addEventListener('click', () => {
        document.getElementById('landing-faq')?.scrollIntoView({ behavior: 'smooth' });
    });

    toggleBtn?.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

    document.getElementById('pending-refresh')?.addEventListener('click', async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await gererApresConnexion(session.user.id);
    });

    // ── Soumission du formulaire ──
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.hidden = true;
        successEl.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = mode === 'signup' ? 'Inscription…' : 'Connexion…';

        if (mode === 'signup') {
            const result = await inscrireCompte(emailInput.value.trim(), passwordInput.value, motivationInput.value.trim());

            submitBtn.disabled = false;
            setMode('signup');

            if (!result.success) {
                errorEl.textContent = result.error?.message || "Échec de l'inscription.";
                errorEl.hidden = false;
                return;
            }

            if (!result.session) {
                successEl.textContent = 'Vérifie ta boîte mail pour confirmer ton inscription, puis connecte-toi.';
                successEl.hidden = false;
                return;
            }

            await gererApresConnexion(result.session.user.id);
            return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value,
        });

        submitBtn.disabled = false;
        setMode('login');

        if (error || !data.session) {
            errorEl.textContent = 'Email ou mot de passe incorrect.';
            errorEl.hidden = false;
            return;
        }

        await gererApresConnexion(data.session.user.id);
    });

    // ── État initial ──
    const { data: { session } } = await supabase.auth.getSession();

    // Compteur de visites (silencieux, ne bloque jamais l'affichage) : distingue
    // les visiteurs déjà connus (session active) des autres.
    enregistrerVisiteLanding(!!session, session?.user?.id ?? null);

    if (session) {
        await gererApresConnexion(session.user.id);
    }
    // Sinon : le landing-screen reste affiché par défaut (visible dans le HTML).
}
