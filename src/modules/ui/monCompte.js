import { getMonProfil, majMesPreferences, changerMotDePasse, seDeconnecter } from '../access.js';
import { CHANGELOG, APP_VERSION } from '../changelogData.js';
import { ouvrirChangelog } from './changelog.js';
import { entreesNonVues } from './nouveautes.js';
import { trapFocus } from './focusTrap.js';

let releaseFocus = null;

/**
 * Câble le bouton flottant « Mon compte » et son panneau (préférences de
 * notification, changement de mot de passe).
 */
export function initMonCompte() {
    const btnOpen = document.getElementById('btn-open-compte');
    const overlay = document.getElementById('compte-overlay');
    if (!btnOpen || !overlay) return;

    btnOpen.hidden = false;
    btnOpen.addEventListener('click', ouvrirMonCompte);
    document.getElementById('compte-fermer')?.addEventListener('click', fermerMonCompte);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fermerMonCompte(); });

    document.getElementById('compte-toggle-notif')?.addEventListener('change', async (e) => {
        const result = await majMesPreferences({ notif_mises_a_jour: e.target.checked });
        if (!result.success) e.target.checked = !e.target.checked;
    });

    document.getElementById('compte-mdp-form')?.addEventListener('submit', onChangerMotDePasse);

    document.getElementById('compte-deconnexion')?.addEventListener('click', async () => {
        await seDeconnecter();
        location.reload(); // repart de la landing page, sans état résiduel
    });
}

async function ouvrirMonCompte() {
    const overlay = document.getElementById('compte-overlay');
    overlay.classList.remove('hidden');
    releaseFocus = trapFocus(overlay.querySelector('.portal-card'), fermerMonCompte);

    const profil = await getMonProfil();
    const toggle = document.getElementById('compte-toggle-notif');
    if (toggle) toggle.checked = profil?.notif_mises_a_jour ?? true;
    const emailEl = document.getElementById('compte-email');
    if (emailEl) emailEl.textContent = profil?.email ?? '';
}

function fermerMonCompte() {
    document.getElementById('compte-overlay')?.classList.add('hidden');
    const form = document.getElementById('compte-mdp-form');
    form?.reset();
    afficherMessageMdp('', false);
    if (releaseFocus) {
        releaseFocus();
        releaseFocus = null;
    }
}

function afficherMessageMdp(texte, succes) {
    const el = document.getElementById('compte-mdp-message');
    if (!el) return;
    el.textContent = texte;
    el.hidden = !texte;
    el.className = succes ? 'auth-success' : 'auth-error';
}

async function onChangerMotDePasse(e) {
    e.preventDefault();
    const ancien = document.getElementById('compte-mdp-ancien').value;
    const nouveau = document.getElementById('compte-mdp-nouveau').value;
    const confirmation = document.getElementById('compte-mdp-confirmation').value;

    if (nouveau.length < 6) return afficherMessageMdp('Le nouveau mot de passe doit faire au moins 6 caractères.', false);
    if (nouveau !== confirmation) return afficherMessageMdp('Les deux nouveaux mots de passe ne correspondent pas.', false);
    if (nouveau === ancien) return afficherMessageMdp("Le nouveau mot de passe doit être différent de l'actuel.", false);

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    const result = await changerMotDePasse(ancien, nouveau);
    btn.disabled = false;

    if (!result.success) return afficherMessageMdp(result.message, false);
    e.target.reset();
    afficherMessageMdp('Mot de passe modifié ✅', true);
}

/**
 * Fenêtre « Quoi de neuf » : montre les versions publiées depuis la dernière
 * visite, si l'utilisateur est abonné aux mises à jour. Mémorise ensuite la
 * version courante comme vue (dans tous les cas, pour ne pas accumuler un
 * arriéré si l'utilisateur se réabonne plus tard).
 */
export async function afficherNouveautesSiBesoin() {
    const profil = await getMonProfil();
    if (!profil || profil.derniere_version_vue === APP_VERSION) return;
    // Version vue inconnue de ce changelog : cette appli (en cache) est plus
    // ancienne que celle déjà vue ailleurs — ne pas faire reculer le marqueur.
    const vueConnue = CHANGELOG.some(e => e.version === profil.derniere_version_vue);
    if (profil.derniere_version_vue && !vueConnue) return;

    const entrees = entreesNonVues(CHANGELOG, profil.derniere_version_vue);
    if (profil.notif_mises_a_jour && entrees.length > 0) {
        ouvrirChangelog({ entrees, titre: 'Quoi de neuf ?' });
    }
    await majMesPreferences({ derniere_version_vue: APP_VERSION });
}
