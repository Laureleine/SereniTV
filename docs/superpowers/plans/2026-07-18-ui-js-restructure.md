# Restructuration de ui.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Découper `src/modules/ui.js` (941 lignes, 7 responsabilités mélangées) en 8 modules ciblés sous `src/modules/ui/`, sans changer aucun comportement observable de l'application.

**Architecture:** Extraction incrémentale, un module à la fois. Chaque tâche déplace un bloc de fonctions cohérent vers un nouveau fichier, remplace sa définition dans `ui.js` par un import, et vérifie que le build et les tests passent avant de committer. `ui.js` finit comme un simple orchestrateur (`initUI()` + wiring d'événements).

**Tech Stack:** JS vanilla (ES modules), Vite, Vitest.

## Global Constraints

- Refactor pur : aucun changement de comportement. Si un test ou une vérification manuelle révèle une différence, corriger avant de continuer — ne rien « améliorer » au passage.
- Ne renommer aucun identifiant exporté/consommé — les noms de fonctions et propriétés doivent rester identiques pour que les références croisées restent valides.
- Après chaque tâche : `npm test` doit passer intégralement et `npm run build` doit réussir sans erreur avant tout commit.
- Les caractères accentués français doivent être préservés exactement tels quels (UTF-8).
- Le dépôt affiche des avertissements `LF will be replaced by CRLF` lors de `git add` — c'est normal et sans conséquence (comportement déjà observé sur les fichiers existants), ne pas tenter de le « corriger ».
- Ne pas toucher à `index.html`, `main.css`, `series.js` (sauf la ligne d'import précisée en Tâche 8), ni au comportement du mode TV/télécommande/zapping.

---

### Task 1: Extraire `ui/toast.js`

**Files:**
- Create: `src/modules/ui/toast.js`
- Modify: `src/modules/ui.js`

**Interfaces:**
- Produces: `showToast(message, type = 'error')` — export nommé, utilisé par le code encore inline dans `ui.js` (handlers de statut, modal) jusqu'à leur extraction dans les tâches suivantes.

- [ ] **Step 1: Créer `src/modules/ui/toast.js`**

```js
let _toastTimer = null;

/**
 * Affiche une notification non bloquante en bas d'écran.
 * @param {string} message
 * @param {'error'|'success'} [type='error']
 */
export function showToast(message, type = 'error') {
    const toast = document.getElementById('toast-container');
    if (!toast) {
        console.error(message);
        return;
    }

    toast.textContent = message;
    toast.className = `toast-container toast-container--${type} is-visible`;

    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
    }, 4000);
}
```

- [ ] **Step 2: Dans `src/modules/ui.js`, retirer la définition de `showToast` et ajouter l'import**

Remplacer :

```js
import {
    filterSeries,
    fetchSeries,
    getSaisonsAvecStatut,
    aDejaUnSuiviSaisons,
    abandonnerSerie,
    demarrerSerie,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    updateStatutUneSaison,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
```

par :

```js
import {
    filterSeries,
    fetchSeries,
    getSaisonsAvecStatut,
    aDejaUnSuiviSaisons,
    abandonnerSerie,
    demarrerSerie,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    updateStatutUneSaison,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { showToast } from './ui/toast.js';
```

Puis supprimer entièrement ce bloc (section notifications) :

```js
// ─────────────────────────────────────────────
// NOTIFICATIONS (toasts non bloquants)
// ─────────────────────────────────────────────

let _toastTimer = null;

/**
 * Affiche une notification non bloquante en bas d'écran.
 * @param {string} message
 * @param {'error'|'success'} [type='error']
 */
export function showToast(message, type = 'error') {
    const toast = document.getElementById('toast-container');
    if (!toast) {
        console.error(message);
        return;
    }

    toast.textContent = message;
    toast.className = `toast-container toast-container--${type} is-visible`;

    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
    }, 4000);
}

// ─────────────────────────────────────────────
// INITIALISATION
// ─────────────────────────────────────────────
```

... remplacé par simplement :

```js
// ─────────────────────────────────────────────
// INITIALISATION
// ─────────────────────────────────────────────
```

(Les appels existants à `showToast(...)` plus loin dans le fichier ne changent pas — ils résolvent maintenant vers l'import au lieu de la définition locale.)

- [ ] **Step 3: Vérifier**

Run: `npm test` — Expected: 6 tests passent toujours (aucun rapport avec ce changement, mais doit rester vert).
Run: `npm run build` — Expected: build réussit sans erreur.

- [ ] **Step 4: Commit**

```bash
git add src/modules/ui/toast.js src/modules/ui.js
git commit -m "refactor: extrait showToast dans ui/toast.js"
```

---

### Task 2: Extraire `ui/playLink.js` et déplacer son test

**Files:**
- Create: `src/modules/ui/playLink.js`
- Create: `src/modules/ui/playLink.test.js`
- Delete: `src/modules/ui.test.js`
- Modify: `src/modules/ui.js`

**Interfaces:**
- Produces: `getPlayLink(serie)` — export nommé, pur (aucune dépendance DOM), consommé par le `renderSeries` encore inline dans `ui.js` jusqu'à la Tâche 6.

- [ ] **Step 1: Créer `src/modules/ui/playLink.js`**

```js
/**
 * Génère le lien de lecture optimal ou le lien de recherche de repli pour la plateforme.
 * @param {object} serie - L'objet série
 * @returns {{url: string, name: string, class: string}} Les infos du lien de lecture
 */
export function getPlayLink(serie) {
    const platform = (serie.plateforme || '').toLowerCase();
    const titre = serie.titre || '';
    const watchUrl = serie.watch_url || '';

    if (platform.includes('netflix')) {
        const match = watchUrl.match(/(?:netflix\.com\/title\/|title\/|netflix:\/\/title\/)([0-9]+)/i);
        if (match && match[1]) {
            return {
                url: `netflix://title/${match[1]}`,
                name: 'Netflix',
                class: 'netflix'
            };
        }
        return {
            url: `https://www.netflix.com/search?q=${encodeURIComponent(titre)}`,
            name: 'Netflix',
            class: 'netflix'
        };
    }

    if (platform.includes('prime video') || platform.includes('amazon')) {
        const match = watchUrl.match(/(?:detail\/|dp\/|gp\/video\/detail\/)([a-zA-Z0-9_]+)/i);
        if (match && match[1]) {
            return {
                url: `primevideo://detail/${match[1]}`,
                name: 'Prime Video',
                class: 'primevideo'
            };
        }
        return {
            url: `https://www.primevideo.com/search/?phrase=${encodeURIComponent(titre)}`,
            name: 'Prime Video',
            class: 'primevideo'
        };
    }

    if (platform.includes('disney')) {
        const match = watchUrl.match(/(?:series\/[^/]+\/|video\/)([a-zA-Z0-9-]+)/i);
        if (match && match[1]) {
            return {
                url: `https://www.disneyplus.com/video/${match[1]}`,
                name: 'Disney+',
                class: 'disney'
            };
        }
        return {
            url: `https://www.disneyplus.com/search?q=${encodeURIComponent(titre)}`,
            name: 'Disney+',
            class: 'disney'
        };
    }

    // Repli ultime : recherche Netflix (jamais IMDb)
    return {
        url: `https://www.netflix.com/search?q=${encodeURIComponent(titre)}`,
        name: 'Netflix',
        class: 'netflix'
    };
}
```

- [ ] **Step 2: Créer `src/modules/ui/playLink.test.js`** (contenu identique à l'actuel `ui.test.js`, import corrigé)

```js
import { describe, it, expect } from 'vitest';
import { getPlayLink } from './playLink.js';

describe('getPlayLink', () => {
    it('génère un deep link Netflix quand un ID est présent dans watch_url', () => {
        const serie = { plateforme: 'Netflix', titre: 'Breaking Bad', watch_url: 'https://www.netflix.com/title/70143836' };
        expect(getPlayLink(serie)).toEqual({
            url: 'netflix://title/70143836',
            name: 'Netflix',
            class: 'netflix',
        });
    });

    it('replie sur une recherche Netflix si aucun ID ne peut être extrait', () => {
        const serie = { plateforme: 'Netflix', titre: 'Breaking Bad', watch_url: '' };
        expect(getPlayLink(serie)).toEqual({
            url: `https://www.netflix.com/search?q=${encodeURIComponent('Breaking Bad')}`,
            name: 'Netflix',
            class: 'netflix',
        });
    });

    it('génère un deep link Prime Video quand un ID est présent', () => {
        const serie = { plateforme: 'Prime Video', titre: 'The Boys', watch_url: 'https://www.primevideo.com/detail/0QZL8I' };
        expect(getPlayLink(serie)).toEqual({
            url: 'primevideo://detail/0QZL8I',
            name: 'Prime Video',
            class: 'primevideo',
        });
    });

    it('reconnaît Amazon comme alias de Prime Video', () => {
        const serie = { plateforme: 'Amazon', titre: 'The Boys', watch_url: '' };
        expect(getPlayLink(serie).name).toBe('Prime Video');
    });

    it('replie sur une recherche Disney+ si aucun ID ne peut être extrait', () => {
        const serie = { plateforme: 'Disney+', titre: 'Loki', watch_url: '' };
        expect(getPlayLink(serie)).toEqual({
            url: `https://www.disneyplus.com/search?q=${encodeURIComponent('Loki')}`,
            name: 'Disney+',
            class: 'disney',
        });
    });

    it('replie sur une recherche Netflix pour une plateforme inconnue ou absente', () => {
        const serie = { plateforme: null, titre: 'Mystère', watch_url: '' };
        expect(getPlayLink(serie)).toEqual({
            url: `https://www.netflix.com/search?q=${encodeURIComponent('Mystère')}`,
            name: 'Netflix',
            class: 'netflix',
        });
    });
});
```

- [ ] **Step 3: Supprimer `src/modules/ui.test.js`** (remplacé par `ui/playLink.test.js`)

- [ ] **Step 4: Dans `src/modules/ui.js`, retirer `getPlayLink` et ajouter l'import**

Ajouter après l'import de `./ui/toast.js` :

```js
import { getPlayLink } from './ui/playLink.js';
```

Supprimer entièrement ce bloc (juste après les imports, avant la section notifications) :

```js
/**
 * Génère le lien de lecture optimal ou le lien de recherche de repli pour la plateforme.
 * @param {object} serie - L'objet série
 * @returns {{url: string, name: string, class: string}} Les infos du lien de lecture
 */
export function getPlayLink(serie) {
    const platform = (serie.plateforme || '').toLowerCase();
    const titre = serie.titre || '';
    const watchUrl = serie.watch_url || '';

    if (platform.includes('netflix')) {
        const match = watchUrl.match(/(?:netflix\.com\/title\/|title\/|netflix:\/\/title\/)([0-9]+)/i);
        if (match && match[1]) {
            return {
                url: `netflix://title/${match[1]}`,
                name: 'Netflix',
                class: 'netflix'
            };
        }
        return {
            url: `https://www.netflix.com/search?q=${encodeURIComponent(titre)}`,
            name: 'Netflix',
            class: 'netflix'
        };
    }

    if (platform.includes('prime video') || platform.includes('amazon')) {
        const match = watchUrl.match(/(?:detail\/|dp\/|gp\/video\/detail\/)([a-zA-Z0-9_]+)/i);
        if (match && match[1]) {
            return {
                url: `primevideo://detail/${match[1]}`,
                name: 'Prime Video',
                class: 'primevideo'
            };
        }
        return {
            url: `https://www.primevideo.com/search/?phrase=${encodeURIComponent(titre)}`,
            name: 'Prime Video',
            class: 'primevideo'
        };
    }

    if (platform.includes('disney')) {
        const match = watchUrl.match(/(?:series\/[^/]+\/|video\/)([a-zA-Z0-9-]+)/i);
        if (match && match[1]) {
            return {
                url: `https://www.disneyplus.com/video/${match[1]}`,
                name: 'Disney+',
                class: 'disney'
            };
        }
        return {
            url: `https://www.disneyplus.com/search?q=${encodeURIComponent(titre)}`,
            name: 'Disney+',
            class: 'disney'
        };
    }

    // Repli ultime : recherche Netflix (jamais IMDb)
    return {
        url: `https://www.netflix.com/search?q=${encodeURIComponent(titre)}`,
        name: 'Netflix',
        class: 'netflix'
    };
}

```

(Ne pas supprimer la ligne `// ─── INITIALISATION ───` qui suit.)

- [ ] **Step 5: Vérifier**

Run: `npm test` — Expected: 6 tests passent (maintenant depuis `ui/playLink.test.js`).
Run: `npm run build` — Expected: réussit.

- [ ] **Step 6: Commit**

```bash
git add src/modules/ui/playLink.js src/modules/ui/playLink.test.js src/modules/ui.js
git rm src/modules/ui.test.js
git commit -m "refactor: extrait getPlayLink dans ui/playLink.js"
```

---

### Task 3: Extraire `ui/saisonsPanel.js`

**Files:**
- Create: `src/modules/ui/saisonsPanel.js`
- Modify: `src/modules/ui.js`

**Interfaces:**
- Consumes: `getSaisonsAvecStatut(serieId, userId)`, `MOCK_USER_ID` depuis `../series.js`.
- Produces: `toggleSaisonsPanel(serieId, card)` — export nommé, appelé depuis `initUI()` (délégation de clic sur les cartes).

- [ ] **Step 1: Créer `src/modules/ui/saisonsPanel.js`**

```js
import { getSaisonsAvecStatut, MOCK_USER_ID } from '../series.js';

/**
 * Ouvre/ferme le panneau des saisons d'une carte série, en chargeant les
 * saisons à la demande lors du premier affichage.
 */
export async function toggleSaisonsPanel(serieId, card) {
    const panel = document.getElementById(`saisons-panel-${serieId}`);
    const contentDiv = document.getElementById(`saisons-content-${serieId}`);

    if (!panel) return;

    const isOpen = !panel.hidden;

    if (isOpen) {
        panel.hidden = true;
        card.classList.remove('is-expanded');
    } else {
        panel.hidden = false;
        card.classList.add('is-expanded');

        if (contentDiv.querySelector('.saisons-loading')) {
            try {
                const saisons = await getSaisonsAvecStatut(serieId, MOCK_USER_ID);
                renderSaisonsList(contentDiv, saisons);
            } catch (err) {
                console.error("Erreur chargement saisons:", err);
                contentDiv.innerHTML = '<div class="saisons-error">Erreur lors du chargement des saisons.</div>';
            }
        }
    }
}

function renderSaisonsList(container, saisons) {
    if (!saisons || saisons.length === 0) {
        container.innerHTML = '<div class="saisons-empty">Aucune saison disponible.</div>';
        return;
    }

    const statuts = ['Pas commencée', 'En cours', 'Terminée'];

    const html = saisons.map(s => {
        const currentStatut = s.utilisateur_saisons?.[0]?.statut_saison || 'Pas commencée';
        const options = statuts.map(st =>
            `<option value="${st}" ${currentStatut === st ? 'selected' : ''}>${st}</option>`
        ).join('');

        return `
            <div class="saison-item">
                <div class="saison-item-info">
                    <span class="saison-item-titre">Saison ${s.numero_saison}</span>
                    <span class="saison-item-episodes">${s.nombre_episodes} épisodes</span>
                </div>
                <select 
                    class="saison-statut-select" 
                    data-saison-id="${s.id}"
                    aria-label="Statut de la saison ${s.numero_saison}"
                >
                    ${options}
                </select>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}
```

- [ ] **Step 2: Dans `src/modules/ui.js`, retirer `toggleSaisonsPanel`/`renderSaisonsList` et ajouter l'import**

Ajouter après l'import de `./ui/playLink.js` :

```js
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
```

Supprimer entièrement ce bloc en fin de fichier (section accordéon) :

```js
// ─────────────────────────────────────────────
// ACCORDÉON SAISONS
// ─────────────────────────────────────────────

async function toggleSaisonsPanel(serieId, card) {
    const panel = document.getElementById(`saisons-panel-${serieId}`);
    const contentDiv = document.getElementById(`saisons-content-${serieId}`);
    
    if (!panel) return;

    const isOpen = !panel.hidden;

    if (isOpen) {
        panel.hidden = true;
        card.classList.remove('is-expanded');
    } else {
        panel.hidden = false;
        card.classList.add('is-expanded');
        
        if (contentDiv.querySelector('.saisons-loading')) {
            try {
                const saisons = await getSaisonsAvecStatut(serieId, MOCK_USER_ID);
                renderSaisonsList(contentDiv, saisons);
            } catch (err) {
                console.error("Erreur chargement saisons:", err);
                contentDiv.innerHTML = '<div class="saisons-error">Erreur lors du chargement des saisons.</div>';
            }
        }
    }
}

function renderSaisonsList(container, saisons) {
    if (!saisons || saisons.length === 0) {
        container.innerHTML = '<div class="saisons-empty">Aucune saison disponible.</div>';
        return;
    }

    const statuts = ['Pas commencée', 'En cours', 'Terminée'];

    const html = saisons.map(s => {
        const currentStatut = s.utilisateur_saisons?.[0]?.statut_saison || 'Pas commencée';
        const options = statuts.map(st => 
            `<option value="${st}" ${currentStatut === st ? 'selected' : ''}>${st}</option>`
        ).join('');

        return `
            <div class="saison-item">
                <div class="saison-item-info">
                    <span class="saison-item-titre">Saison ${s.numero_saison}</span>
                    <span class="saison-item-episodes">${s.nombre_episodes} épisodes</span>
                </div>
                <select 
                    class="saison-statut-select" 
                    data-saison-id="${s.id}"
                    aria-label="Statut de la saison ${s.numero_saison}"
                >
                    ${options}
                </select>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}
```

- [ ] **Step 3: Vérifier**

Run: `npm test` — Expected: passent.
Run: `npm run build` — Expected: réussit.

- [ ] **Step 4: Commit**

```bash
git add src/modules/ui/saisonsPanel.js src/modules/ui.js
git commit -m "refactor: extrait toggleSaisonsPanel dans ui/saisonsPanel.js"
```

---

### Task 4: Extraire `ui/modal.js`

**Files:**
- Create: `src/modules/ui/modal.js`
- Modify: `src/modules/ui.js`

**Interfaces:**
- Consumes: `getSaisonsAvecStatut, abandonnerSerie, demarrerSerie, fetchSeries, MOCK_USER_ID` depuis `../series.js` ; `showToast` depuis `./toast.js`.
- Produces: `ouvrirModal(config)`, `fermerModal(annule = true)`, `onConfirmerModal()` — exports nommés. `ouvrirModal` sera appelé depuis `statusHandlers.js` (Tâche 5) ; `fermerModal`/`onConfirmerModal` sont attachés comme listeners dans `initUI()`.

- [ ] **Step 1: Créer `src/modules/ui/modal.js`**

```js
import { getSaisonsAvecStatut, abandonnerSerie, demarrerSerie, fetchSeries, MOCK_USER_ID } from '../series.js';
import { showToast } from './toast.js';

let _modalContext = null;

/**
 * Ouvre le modal générique (abandon ou démarrage) après avoir chargé les saisons de la série.
 * @param {object} config
 */
export async function ouvrirModal(config) {
    const { serieId, serieTitre, selectElement, mode, titre, description, labelBtn, finalStatut } = config;

    try {
        const saisons = await getSaisonsAvecStatut(serieId, MOCK_USER_ID);

        if (!saisons || saisons.length === 0) {
            showToast("Cette série n'a aucune saison enregistrée.");
            selectElement.value = '';
            return;
        }

        _modalContext = { serieId, serieTitre, selectElement, mode, finalStatut, labelBtn };

        document.getElementById('modal-titre').textContent      = titre;
        document.getElementById('modal-serie-titre').textContent = serieTitre;
        document.getElementById('modal-description-label').textContent = description;
        document.getElementById('modal-confirmer').textContent  = labelBtn;

        const btnConfirmer = document.getElementById('modal-confirmer');
        btnConfirmer.className = mode === 'abandon'
            ? 'btn btn--danger'
            : 'btn btn--primary';

        const saisonSelect = document.getElementById('modal-saison-select');
        saisonSelect.innerHTML = saisons.map(s =>
            `<option value="${s.id}" data-numero="${s.numero_saison}">
                Saison ${s.numero_saison} (${s.nombre_episodes} épisodes)
            </option>`
        ).join('');

        document.getElementById('modal-overlay').classList.add('is-visible');
        document.getElementById('modal-abandon').classList.add('is-visible');

    } catch (err) {
        console.error("[MODAL] Erreur chargement saisons:", err);
        showToast("Impossible de charger les saisons. Veuillez réessayer.");
        if (selectElement) selectElement.value = '';
    }
}

/**
 * Ferme le modal générique. Par défaut, réinitialise le select d'origine (cas annulation).
 * @param {boolean} [annule=true]
 */
export function fermerModal(annule = true) {
    document.getElementById('modal-overlay').classList.remove('is-visible');
    document.getElementById('modal-abandon').classList.remove('is-visible');

    if (annule && _modalContext?.selectElement) {
        _modalContext.selectElement.value = '';
    }
    _modalContext = null;
}

/**
 * Gère le clic sur le bouton de confirmation du modal.
 */
export async function onConfirmerModal() {
    if (!_modalContext) return;

    const { serieId, mode, finalStatut, selectElement, labelBtn } = _modalContext;
    const saisonSelect   = document.getElementById('modal-saison-select');
    const selectedOption = saisonSelect.options[saisonSelect.selectedIndex];
    const numeroSaison   = parseInt(selectedOption.dataset.numero);

    const btnConfirmer = document.getElementById('modal-confirmer');
    btnConfirmer.disabled = true;
    btnConfirmer.textContent = 'Enregistrement…';

    let result;
    if (mode === 'abandon') {
        result = await abandonnerSerie(serieId, numeroSaison, MOCK_USER_ID);
    } else {
        result = await demarrerSerie(serieId, numeroSaison, MOCK_USER_ID);
    }

    btnConfirmer.disabled = false;
    btnConfirmer.textContent = labelBtn;

    if (result.success) {
        if (selectElement) selectElement.value = finalStatut;
        fermerModal(false);
        await fetchSeries();
    } else {
        showToast("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    }
}
```

**Note pour l'implémenteur :** `fermerModal` est branché directement comme listener DOM (`addEventListener('click', fermerModal)`), donc l'événement `click` lui est passé en premier argument (`annule`). C'est le comportement actuel — un objet `Event` est « truthy » donc la branche de réinitialisation s'exécute. Ne pas « corriger » ce couplage implicite, le préserver tel quel.

- [ ] **Step 2: Dans `src/modules/ui.js`, retirer le bloc modal et ajouter l'import**

Retirer `getSaisonsAvecStatut`, `abandonnerSerie`, `demarrerSerie` de l'import `./series.js` (plus utilisés directement dans `ui.js` après cette tâche) :

Remplacer :

```js
import {
    filterSeries,
    fetchSeries,
    getSaisonsAvecStatut,
    aDejaUnSuiviSaisons,
    abandonnerSerie,
    demarrerSerie,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    updateStatutUneSaison,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { showToast } from './ui/toast.js';
import { getPlayLink } from './ui/playLink.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
```

par :

```js
import {
    filterSeries,
    fetchSeries,
    aDejaUnSuiviSaisons,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    updateStatutUneSaison,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { showToast } from './ui/toast.js';
import { getPlayLink } from './ui/playLink.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { ouvrirModal, fermerModal, onConfirmerModal } from './ui/modal.js';
```

Supprimer entièrement ce bloc (section modal générique) :

```js
// ─────────────────────────────────────────────
// MODAL GÉNÉRIQUE (Abandon / Démarrage)
// ─────────────────────────────────────────────

let _modalContext = null;

async function ouvrirModal(config) {
    const { serieId, serieTitre, selectElement, mode, titre, description, labelBtn, finalStatut } = config;

    try {
        const saisons = await getSaisonsAvecStatut(serieId, MOCK_USER_ID);

        if (!saisons || saisons.length === 0) {
            showToast("Cette série n'a aucune saison enregistrée.");
            selectElement.value = '';
            return;
        }

        _modalContext = { serieId, serieTitre, selectElement, mode, finalStatut, labelBtn };

        document.getElementById('modal-titre').textContent      = titre;
        document.getElementById('modal-serie-titre').textContent = serieTitre;
        document.getElementById('modal-description-label').textContent = description;
        document.getElementById('modal-confirmer').textContent  = labelBtn;

        const btnConfirmer = document.getElementById('modal-confirmer');
        btnConfirmer.className = mode === 'abandon'
            ? 'btn btn--danger'
            : 'btn btn--primary';

        const saisonSelect = document.getElementById('modal-saison-select');
        saisonSelect.innerHTML = saisons.map(s =>
            `<option value="${s.id}" data-numero="${s.numero_saison}">
                Saison ${s.numero_saison} (${s.nombre_episodes} épisodes)
            </option>`
        ).join('');

        document.getElementById('modal-overlay').classList.add('is-visible');
        document.getElementById('modal-abandon').classList.add('is-visible');

    } catch (err) {
        console.error("[MODAL] Erreur chargement saisons:", err);
        showToast("Impossible de charger les saisons. Veuillez réessayer.");
        if (selectElement) selectElement.value = '';
    }
}

function fermerModal(annule = true) {
    document.getElementById('modal-overlay').classList.remove('is-visible');
    document.getElementById('modal-abandon').classList.remove('is-visible');

    if (annule && _modalContext?.selectElement) {
        _modalContext.selectElement.value = '';
    }
    _modalContext = null;
}

async function onConfirmerModal() {
    if (!_modalContext) return;

    const { serieId, mode, finalStatut, selectElement, labelBtn } = _modalContext;
    const saisonSelect   = document.getElementById('modal-saison-select');
    const selectedOption = saisonSelect.options[saisonSelect.selectedIndex];
    const numeroSaison   = parseInt(selectedOption.dataset.numero);

    const btnConfirmer = document.getElementById('modal-confirmer');
    btnConfirmer.disabled = true;
    btnConfirmer.textContent = 'Enregistrement…';

    let result;
    if (mode === 'abandon') {
        result = await abandonnerSerie(serieId, numeroSaison, MOCK_USER_ID);
    } else {
        result = await demarrerSerie(serieId, numeroSaison, MOCK_USER_ID);
    }

    btnConfirmer.disabled = false;
    btnConfirmer.textContent = labelBtn;

    if (result.success) {
        if (selectElement) selectElement.value = finalStatut;
        fermerModal(false);
        await fetchSeries();
    } else {
        showToast("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    }
}

```

Dans `handleAbandonnee` et `handleEnCours` (toujours inline à ce stade), les appels à `ouvrirModal({...})` restent tels quels — ils résolvent maintenant vers l'import.

- [ ] **Step 3: Vérifier**

Run: `npm test` — Expected: passent.
Run: `npm run build` — Expected: réussit.

- [ ] **Step 4: Commit**

```bash
git add src/modules/ui/modal.js src/modules/ui.js
git commit -m "refactor: extrait le modal générique dans ui/modal.js"
```

---

### Task 5: Extraire `ui/statusHandlers.js`

**Files:**
- Create: `src/modules/ui/statusHandlers.js`
- Modify: `src/modules/ui.js`

**Interfaces:**
- Consumes: `updateStatutUneSaison, updateStatutGlobal, aDejaUnSuiviSaisons, fetchSeries, MOCK_USER_ID` depuis `../series.js` ; `showToast` depuis `./toast.js` ; `ouvrirModal` depuis `./modal.js`.
- Produces: `onStatutChange(event)`, `onSaisonStatutChange(event)` — exports nommés, attachés comme listeners dans `initUI()`.

- [ ] **Step 1: Créer `src/modules/ui/statusHandlers.js`**

```js
import { updateStatutUneSaison, updateStatutGlobal, aDejaUnSuiviSaisons, fetchSeries, MOCK_USER_ID } from '../series.js';
import { showToast } from './toast.js';
import { ouvrirModal } from './modal.js';

/**
 * Gère le changement de statut d'une saison spécifique dans l'accordéon.
 */
export async function onSaisonStatutChange(event) {
    const select = event.target;
    const saisonId = parseInt(select.dataset.saisonId);
    const statut = select.value;

    select.disabled = true;
    try {
        const result = await updateStatutUneSaison(saisonId, statut, MOCK_USER_ID);
        if (!result.success) {
            showToast("Erreur lors de la mise à jour de la saison.");
        }
    } finally {
        select.disabled = false;
    }
}

/**
 * Dispatcher central des changements de statut.
 * Chaque statut a sa propre branche logique.
 */
export async function onStatutChange(event) {
    const select = event.target;

    const serieId    = parseInt(select.dataset.serieId);
    const serieTitre = select.dataset.serieTitre;
    const statut     = select.value;

    select.disabled = true;

    try {
        switch (statut) {

            case 'Abandonnée':
                await handleAbandonnee(serieId, serieTitre, select);
                break;

            case 'En cours':
                await handleEnCours(serieId, serieTitre, select);
                break;

            default:
                await handleStatutSimple(serieId, statut, select);
                break;
        }
    } finally {
        select.disabled = false;
    }
}

async function handleStatutSimple(serieId, statut, selectElement) {
    const result = await updateStatutGlobal(serieId, statut, MOCK_USER_ID);
    if (result.success) {
        await fetchSeries();
    } else {
        showToast("Une erreur est survenue lors de l'enregistrement. Voir la console pour les détails.");
        selectElement.value = '';
    }
}

async function handleAbandonnee(serieId, serieTitre, selectElement) {
    await ouvrirModal({
        serieId,
        serieTitre,
        selectElement,
        mode: 'abandon',
        titre:       'Abandonner une série',
        description: `À quelle saison vous êtes-vous arrêté pour`,
        labelBtn:    "Confirmer l'abandon",
        finalStatut: 'Abandonnée',
    });
}

async function handleEnCours(serieId, serieTitre, selectElement) {
    const dejaUnSuivi = await aDejaUnSuiviSaisons(serieId, MOCK_USER_ID);

    if (dejaUnSuivi) {
        console.log(`[UI] Reprise de la série ${serieId} — statuts de saisons préservés.`);
        const result = await updateStatutGlobal(serieId, 'En cours', MOCK_USER_ID);
        if (result.success) {
            await fetchSeries();
        } else {
            showToast("Une erreur est survenue lors de l'enregistrement.");
            if (selectElement) selectElement.value = '';
        }
    } else {
        await ouvrirModal({
            serieId,
            serieTitre,
            selectElement,
            mode: 'demarrage',
            titre:       'Commencer une série',
            description: `À quelle saison commencez-vous`,
            labelBtn:    'Commencer',
            finalStatut: 'En cours',
        });
    }
}
```

- [ ] **Step 2: Dans `src/modules/ui.js`, retirer le bloc de gestion de statut et ajouter l'import**

Remplacer l'import (retirer `aDejaUnSuiviSaisons`, `updateStatutUneSaison` de `./series.js`, retirer `showToast` — plus utilisés directement dans `ui.js` après cette tâche ; retirer `ouvrirModal` de la liste `./ui/modal.js` — n'est plus appelé directement dans `ui.js`) :

Remplacer :

```js
import {
    filterSeries,
    fetchSeries,
    aDejaUnSuiviSaisons,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    updateStatutUneSaison,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { showToast } from './ui/toast.js';
import { getPlayLink } from './ui/playLink.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { ouvrirModal, fermerModal, onConfirmerModal } from './ui/modal.js';
```

par :

```js
import {
    filterSeries,
    fetchSeries,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { getPlayLink } from './ui/playLink.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { fermerModal, onConfirmerModal } from './ui/modal.js';
import { onStatutChange, onSaisonStatutChange } from './ui/statusHandlers.js';
```

Supprimer entièrement ces deux blocs (sections gestion du changement de statut + handlers métier) :

```js
// ─────────────────────────────────────────────
// GESTION DU CHANGEMENT DE STATUT
// ─────────────────────────────────────────────

/**
 * Gère le changement de statut d'une saison spécifique dans l'accordéon.
 */
async function onSaisonStatutChange(event) {
    const select = event.target;
    const saisonId = parseInt(select.dataset.saisonId);
    const statut = select.value;

    select.disabled = true;
    try {
        const result = await updateStatutUneSaison(saisonId, statut, MOCK_USER_ID);
        if (!result.success) {
            showToast("Erreur lors de la mise à jour de la saison.");
        }
    } finally {
        select.disabled = false;
    }
}

/**
 * Dispatcher central des changements de statut.
 * Chaque statut a sa propre branche logique.
 */
async function onStatutChange(event) {
    const select = event.target;

    const serieId    = parseInt(select.dataset.serieId);
    const serieTitre = select.dataset.serieTitre;
    const statut     = select.value;

    select.disabled = true;

    try {
        switch (statut) {

            case 'Abandonnée':
                await handleAbandonnee(serieId, serieTitre, select);
                break;

            case 'En cours':
                await handleEnCours(serieId, serieTitre, select);
                break;

            default:
                await handleStatutSimple(serieId, statut, select);
                break;
        }
    } finally {
        select.disabled = false;
    }
}

// ─────────────────────────────────────────────
// HANDLERS MÉTIER
// ─────────────────────────────────────────────

async function handleStatutSimple(serieId, statut, selectElement) {
    const result = await updateStatutGlobal(serieId, statut, MOCK_USER_ID);
    if (result.success) {
        await fetchSeries();
    } else {
        showToast("Une erreur est survenue lors de l'enregistrement. Voir la console pour les détails.");
        selectElement.value = '';
    }
}

async function handleAbandonnee(serieId, serieTitre, selectElement) {
    await ouvrirModal({
        serieId,
        serieTitre,
        selectElement,
        mode: 'abandon',
        titre:       'Abandonner une série',
        description: `À quelle saison vous êtes-vous arrêté pour`,
        labelBtn:    "Confirmer l'abandon",
        finalStatut: 'Abandonnée',
    });
}

async function handleEnCours(serieId, serieTitre, selectElement) {
    const dejaUnSuivi = await aDejaUnSuiviSaisons(serieId, MOCK_USER_ID);

    if (dejaUnSuivi) {
        console.log(`[UI] Reprise de la série ${serieId} — statuts de saisons préservés.`);
        const result = await updateStatutGlobal(serieId, 'En cours', MOCK_USER_ID);
        if (result.success) {
            await fetchSeries();
        } else {
            showToast("Une erreur est survenue lors de l'enregistrement.");
            if (selectElement) selectElement.value = '';
        }
    } else {
        await ouvrirModal({
            serieId,
            serieTitre,
            selectElement,
            mode: 'demarrage',
            titre:       'Commencer une série',
            description: `À quelle saison commencez-vous`,
            labelBtn:    'Commencer',
            finalStatut: 'En cours',
        });
    }
}

```

(La délégation d'événement dans `initUI()` — `container.addEventListener('change', ...)` qui appelle `onStatutChange(e)` / `onSaisonStatutChange(e)` — reste inchangée, elle résout maintenant vers les imports.)

- [ ] **Step 3: Vérifier**

Run: `npm test` — Expected: passent.
Run: `npm run build` — Expected: réussit.

- [ ] **Step 4: Commit**

```bash
git add src/modules/ui/statusHandlers.js src/modules/ui.js
git commit -m "refactor: extrait les handlers de statut dans ui/statusHandlers.js"
```

---

### Task 6: Créer `ui/state.js` et extraire `ui/catalogRender.js`

**Files:**
- Create: `src/modules/ui/state.js`
- Create: `src/modules/ui/catalogRender.js`
- Modify: `src/modules/ui.js`

**Interfaces:**
- Produces (`state.js`): `state` — objet mutable exporté `{ currentMode, tvPreviewOverride, dernierRenduSeries }`. Toute lecture/écriture se fait via `state.currentMode = ...` (pas de réassignation d'import — impossible en ES modules).
- Produces (`catalogRender.js`): `renderSeries(seriesList)`, `renderFetchError()` — exports nommés.
- Consumes: `state` (ce module), `getPlayLink` depuis `./playLink.js`, `fetchSeries` depuis `../series.js`.

**Important :** cette tâche modifie aussi `initUI()` (qui reste dans `ui.js`) pour utiliser `state.currentMode` / `state.tvPreviewOverride` / `state.dernierRenduSeries` au lieu des variables locales `currentMode` / `tvPreviewOverride` / `_dernierRenduSeries` — sans ce changement simultané, `ui.js` et `catalogRender.js` auraient chacun leur propre copie de l'état, désynchronisée (ex : changer de mode TV depuis `initUI()` ne serait plus visible par `renderSeries()`).

- [ ] **Step 1: Créer `src/modules/ui/state.js`**

```js
export const state = {
    currentMode: 'pc',
    tvPreviewOverride: null,
    dernierRenduSeries: [],
};
```

- [ ] **Step 2: Créer `src/modules/ui/catalogRender.js`**

```js
import { fetchSeries } from '../series.js';
import { getPlayLink } from './playLink.js';
import { state } from './state.js';

const STATUTS_VISIONNAGE = ['A voir', 'En cours', 'Terminée', 'Abandonnée', 'Sans intérêt', 'Peut-être'];

/**
 * Affiche un état d'erreur avec bouton de reprise quand le chargement du catalogue échoue
 * (ex : coupure réseau, Supabase indisponible).
 */
export function renderFetchError() {
    const container = document.getElementById('series-container');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state empty-state--error">
            <p>Impossible de charger vos séries. Vérifiez votre connexion.</p>
            <button id="btn-retry-fetch" class="btn btn--primary">Réessayer</button>
        </div>
    `;

    document.getElementById('btn-retry-fetch').addEventListener('click', () => fetchSeries());
}

export function renderSeries(seriesList) {
    state.dernierRenduSeries = [...seriesList];

    const container = document.getElementById('series-container');
    container.innerHTML = '';

    const isTvMode = state.currentMode === 'tv';
    const isRemoteMode = state.currentMode === 'remote';

    // Gestion du fond d'écran Cinéma pour le Mode TV
    const tvBackdrop = document.getElementById('tv-backdrop');
    if (tvBackdrop) {
        const activeSerie = (isTvMode && state.tvPreviewOverride) || ((isTvMode || isRemoteMode) ? seriesList[0] : null);
        if (isTvMode && activeSerie && activeSerie.backdrop_path) {
            const backdropUrl = `https://image.tmdb.org/t/p/w1280${activeSerie.backdrop_path}`;
            tvBackdrop.style.backgroundImage = `linear-gradient(to top, #111 15%, rgba(17, 17, 17, 0.85) 100%), url(${backdropUrl})`;
            tvBackdrop.classList.add('is-active');
        } else {
            tvBackdrop.style.backgroundImage = '';
            tvBackdrop.classList.remove('is-active');
        }
    }

    if (isTvMode || isRemoteMode) {
        const activeSerie = (isTvMode && state.tvPreviewOverride) || seriesList[0];
        if (!activeSerie) {
            container.innerHTML = isTvMode ? `
                <div class="tv-empty-state">
                    <div class="tv-empty-icon">📺</div>
                    <h2 class="tv-empty-title">Inbox Trié !</h2>
                    <p class="tv-empty-subtitle">SéréniTV est prêt. Ajoutez ou classez des séries depuis votre mobile.</p>
                </div>
            ` : `
                <div class="empty-state">
                    Tous les titres de l'Inbox ont été classés ! 🎉
                </div>
            `;
            updateRemoteDeckVisibility(0);
            return;
        }

        const card = document.createElement('div');
        card.className = isTvMode ? 'serie-card tv-card' : 'serie-card remote-active-card';
        card.dataset.serieId = activeSerie.id;

        const posterUrl = activeSerie.affiche_path
            ? `https://image.tmdb.org/t/p/w500${activeSerie.affiche_path}`
            : null;

        card.innerHTML = `
            <div class="card-poster">
                ${posterUrl 
                    ? `<img src="${posterUrl}" alt="Affiche de ${activeSerie.titre}" loading="eager">` 
                    : `<div class="poster-placeholder"><span>🎬</span></div>`
                }
            </div>
            <div class="card-content">
                <div class="card-header">
                    <h2 class="serie-title">${activeSerie.titre}</h2>
                </div>
                ${activeSerie.plateforme ? `<div class="serie-platform-badge">${activeSerie.plateforme}</div>` : ''}
                <p class="serie-synopsis">${activeSerie.synopsis || 'Aucun résumé disponible.'}</p>
                ${(() => {
                    const playLink = getPlayLink(activeSerie);
                    return isTvMode ? `
                        <a href="${playLink.url}" class="btn-netflix-launch btn-launch-${playLink.class}">
                            🍿 Lancer sur ${playLink.name}
                        </a>
                    ` : `
                        <button data-watch-url="${playLink.url}" class="btn-netflix-launch btn-launch-${playLink.class}">
                            📺 Lancer sur la Télévision
                        </button>
                    `;
                })()}
            </div>
        `;

        container.appendChild(card);
        updateRemoteDeckVisibility(1);
        return;
    }

    if (!seriesList || seriesList.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucune série trouvée.</div>';
        updateRemoteDeckVisibility(0);
        return;
    }

    seriesList.forEach(serie => {
        const card = document.createElement('div');
        card.className = 'serie-card';
        card.dataset.serieId = serie.id;

        const posterUrl = serie.affiche_path
            ? `https://image.tmdb.org/t/p/w500${serie.affiche_path}`
            : null;

        card.innerHTML = `
            <div class="card-poster">
                ${posterUrl 
                    ? `<img src="${posterUrl}" alt="Affiche de ${serie.titre}" loading="lazy">` 
                    : `<div class="poster-placeholder"><span>🎬</span></div>`
                }
            </div>
            <div class="card-content">
                <div class="card-header">
                    <h2 class="serie-title">${serie.titre}</h2>
                </div>
                ${serie.plateforme ? `<div class="serie-platform-badge">${serie.plateforme}</div>` : ''}
                <p class="serie-synopsis">${serie.synopsis || 'Aucun résumé disponible.'}</p>
                <div class="card-footer">
                    <select
                        class="statut-select"
                        id="statut-${serie.id}"
                        data-serie-id="${serie.id}"
                        data-serie-titre="${serie.titre}"
                        aria-label="Statut de visionnage de ${serie.titre}"
                    >
                        <option value="" disabled ${!serie.statut_visionnage ? 'selected' : ''}>Classer cette série…</option>
                        ${STATUTS_VISIONNAGE.map(s => {
                            const label = s === 'Sans intérêt' ? 'Ignorée' : (s === 'A voir' ? 'À voir' : s);
                            return `<option value="${s}" ${serie.statut_visionnage === s ? 'selected' : ''}>${label}</option>`;
                        }).join('')}
                    </select>
                </div>
            </div>
            <!-- Panneau des saisons (caché par défaut) -->
            <div class="saisons-panel" id="saisons-panel-${serie.id}" hidden>
                <div class="saisons-panel-inner" id="saisons-content-${serie.id}">
                    <div class="saisons-loading">Chargement des saisons...</div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });

    updateRemoteDeckVisibility(seriesList.length);
}

/**
 * Met à jour la visibilité de la télécommande sur mobile.
 */
function updateRemoteDeckVisibility(seriesCount) {
    const remoteDeck = document.getElementById('remote-deck');
    if (!remoteDeck) return;

    const activeNavBtn = document.querySelector('.nav-btn.active');
    const isInboxTab = activeNavBtn && activeNavBtn.dataset.filter === 'all';

    // Si on est en mode télécommande OU (mode PC et onglet Inbox avec des séries)
    if (state.currentMode === 'remote' || (state.currentMode === 'pc' && isInboxTab && seriesCount > 0)) {
        remoteDeck.hidden = false;
    } else {
        remoteDeck.hidden = true;
    }
}
```

- [ ] **Step 3: Dans `src/modules/ui.js`, retirer le rendu du catalogue, brancher `state`, et mettre à jour `initUI()`**

Remplacer l'import (retirer `getPlayLink` — n'est plus utilisé directement dans `ui.js`) :

Remplacer :

```js
import {
    filterSeries,
    fetchSeries,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { getPlayLink } from './ui/playLink.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { fermerModal, onConfirmerModal } from './ui/modal.js';
import { onStatutChange, onSaisonStatutChange } from './ui/statusHandlers.js';
```

par :

```js
import {
    filterSeries,
    fetchSeries,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { state } from './ui/state.js';
import { renderSeries } from './ui/catalogRender.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { fermerModal, onConfirmerModal } from './ui/modal.js';
import { onStatutChange, onSaisonStatutChange } from './ui/statusHandlers.js';
```

Remplacer la déclaration des variables d'état locales :

```js
export let currentMode = 'pc';
let _dernierRenduSeries = [];
let tvPreviewOverride = null;

export function initUI() {
```

par :

```js
export function initUI() {
```

Dans le corps de `initUI()`, remplacer chaque occurrence de `currentMode = 'tv'` / `'remote'` / `'pc'` par `state.currentMode = ...`, chaque `tvPreviewOverride` par `state.tvPreviewOverride`, et chaque `_dernierRenduSeries` par `state.dernierRenduSeries`. Précisément :

Remplacer :

```js
        btnTv.addEventListener('click', () => {
            currentMode = 'tv';
            document.body.classList.add('is-tv-mode');
            overlay.classList.add('hidden');
            initRealtimeZapping(
                (payload) => {
                    console.log('[REALTIME TV] Événement reçu, mise à jour du catalogue en cours.');
                    tvPreviewOverride = null; // Réinitialise la prévisualisation pour afficher la série suivante
                },
                (watchUrl) => {
                    console.log('[REALTIME TV] Lancement demandé via mobile! URL:', watchUrl);
                    window.location.href = watchUrl;
                },
                (series) => {
                    console.log('[REALTIME TV] Preview demandée pour la série :', series ? series.titre : 'null (clear)');
                    tvPreviewOverride = series;
                    renderSeries(_dernierRenduSeries);
                }
            );
            fetchSeries();
        });

        btnRemote.addEventListener('click', () => {
            currentMode = 'remote';
            document.body.classList.add('is-remote-mode');
            overlay.classList.add('hidden');
            fetchSeries();
        });

        btnPc.addEventListener('click', () => {
            currentMode = 'pc';
            overlay.classList.add('hidden');
            fetchSeries();
        });
```

par :

```js
        btnTv.addEventListener('click', () => {
            state.currentMode = 'tv';
            document.body.classList.add('is-tv-mode');
            overlay.classList.add('hidden');
            initRealtimeZapping(
                (payload) => {
                    console.log('[REALTIME TV] Événement reçu, mise à jour du catalogue en cours.');
                    state.tvPreviewOverride = null; // Réinitialise la prévisualisation pour afficher la série suivante
                },
                (watchUrl) => {
                    console.log('[REALTIME TV] Lancement demandé via mobile! URL:', watchUrl);
                    window.location.href = watchUrl;
                },
                (series) => {
                    console.log('[REALTIME TV] Preview demandée pour la série :', series ? series.titre : 'null (clear)');
                    state.tvPreviewOverride = series;
                    renderSeries(state.dernierRenduSeries);
                }
            );
            fetchSeries();
        });

        btnRemote.addEventListener('click', () => {
            state.currentMode = 'remote';
            document.body.classList.add('is-remote-mode');
            overlay.classList.add('hidden');
            fetchSeries();
        });

        btnPc.addEventListener('click', () => {
            state.currentMode = 'pc';
            overlay.classList.add('hidden');
            fetchSeries();
        });
```

Remplacer :

```js
    container.addEventListener('click', (e) => {
        if (currentMode === 'tv' || currentMode === 'remote') return;
```

par :

```js
    container.addEventListener('click', (e) => {
        if (state.currentMode === 'tv' || state.currentMode === 'remote') return;
```

Remplacer le bloc `optimisteTriage` :

```js
        const optimisteTriage = (id, statut, triggerPreview = false) => {
            // Retrouver la série active avant de la retirer
            const activeSerie = _dernierRenduSeries.find(s => s.id === id);

            // 1. Mise à jour visuelle instantanée
            const index = _dernierRenduSeries.findIndex(s => s.id === id);
            if (index !== -1) {
                _dernierRenduSeries.splice(index, 1);
                renderSeries(_dernierRenduSeries);
            }
            
            // 2. Diffuser preview ou clear preview
```

par :

```js
        const optimisteTriage = (id, statut, triggerPreview = false) => {
            // Retrouver la série active avant de la retirer
            const activeSerie = state.dernierRenduSeries.find(s => s.id === id);

            // 1. Mise à jour visuelle instantanée
            const index = state.dernierRenduSeries.findIndex(s => s.id === id);
            if (index !== -1) {
                state.dernierRenduSeries.splice(index, 1);
                renderSeries(state.dernierRenduSeries);
            }
            
            // 2. Diffuser preview ou clear preview
```

Remplacer :

```js
    container.addEventListener('click', (e) => {
        const btnLaunch = e.target.closest('.btn-netflix-launch');
        if (btnLaunch && currentMode === 'remote') {
```

par :

```js
    container.addEventListener('click', (e) => {
        const btnLaunch = e.target.closest('.btn-netflix-launch');
        if (btnLaunch && state.currentMode === 'remote') {
```

Supprimer entièrement ces deux blocs en fin de fichier (section rendu du catalogue) :

```js
// ─────────────────────────────────────────────
// RENDU DU CATALOGUE
// ─────────────────────────────────────────────

const STATUTS_VISIONNAGE = ['A voir', 'En cours', 'Terminée', 'Abandonnée', 'Sans intérêt', 'Peut-être'];

/**
 * Affiche un état d'erreur avec bouton de reprise quand le chargement du catalogue échoue
 * (ex : coupure réseau, Supabase indisponible).
 */
export function renderFetchError() {
    const container = document.getElementById('series-container');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state empty-state--error">
            <p>Impossible de charger vos séries. Vérifiez votre connexion.</p>
            <button id="btn-retry-fetch" class="btn btn--primary">Réessayer</button>
        </div>
    `;

    document.getElementById('btn-retry-fetch').addEventListener('click', () => fetchSeries());
}

export function renderSeries(seriesList) {
    _dernierRenduSeries = [...seriesList];

    const container = document.getElementById('series-container');
    container.innerHTML = '';

    const isTvMode = currentMode === 'tv';
    const isRemoteMode = currentMode === 'remote';

    // Gestion du fond d'écran Cinéma pour le Mode TV
    const tvBackdrop = document.getElementById('tv-backdrop');
    if (tvBackdrop) {
        const activeSerie = (isTvMode && tvPreviewOverride) || ((isTvMode || isRemoteMode) ? seriesList[0] : null);
        if (isTvMode && activeSerie && activeSerie.backdrop_path) {
            const backdropUrl = `https://image.tmdb.org/t/p/w1280${activeSerie.backdrop_path}`;
            tvBackdrop.style.backgroundImage = `linear-gradient(to top, #111 15%, rgba(17, 17, 17, 0.85) 100%), url(${backdropUrl})`;
            tvBackdrop.classList.add('is-active');
        } else {
            tvBackdrop.style.backgroundImage = '';
            tvBackdrop.classList.remove('is-active');
        }
    }

    if (isTvMode || isRemoteMode) {
        const activeSerie = (isTvMode && tvPreviewOverride) || seriesList[0];
        if (!activeSerie) {
            container.innerHTML = isTvMode ? `
                <div class="tv-empty-state">
                    <div class="tv-empty-icon">📺</div>
                    <h2 class="tv-empty-title">Inbox Trié !</h2>
                    <p class="tv-empty-subtitle">SéréniTV est prêt. Ajoutez ou classez des séries depuis votre mobile.</p>
                </div>
            ` : `
                <div class="empty-state">
                    Tous les titres de l'Inbox ont été classés ! 🎉
                </div>
            `;
            updateRemoteDeckVisibility(0);
            return;
        }

        const card = document.createElement('div');
        card.className = isTvMode ? 'serie-card tv-card' : 'serie-card remote-active-card';
        card.dataset.serieId = activeSerie.id;

        const posterUrl = activeSerie.affiche_path
            ? `https://image.tmdb.org/t/p/w500${activeSerie.affiche_path}`
            : null;

        card.innerHTML = `
            <div class="card-poster">
                ${posterUrl 
                    ? `<img src="${posterUrl}" alt="Affiche de ${activeSerie.titre}" loading="eager">` 
                    : `<div class="poster-placeholder"><span>🎬</span></div>`
                }
            </div>
            <div class="card-content">
                <div class="card-header">
                    <h2 class="serie-title">${activeSerie.titre}</h2>
                </div>
                ${activeSerie.plateforme ? `<div class="serie-platform-badge">${activeSerie.plateforme}</div>` : ''}
                <p class="serie-synopsis">${activeSerie.synopsis || 'Aucun résumé disponible.'}</p>
                ${(() => {
                    const playLink = getPlayLink(activeSerie);
                    return isTvMode ? `
                        <a href="${playLink.url}" class="btn-netflix-launch btn-launch-${playLink.class}">
                            🍿 Lancer sur ${playLink.name}
                        </a>
                    ` : `
                        <button data-watch-url="${playLink.url}" class="btn-netflix-launch btn-launch-${playLink.class}">
                            📺 Lancer sur la Télévision
                        </button>
                    `;
                })()}
            </div>
        `;

        container.appendChild(card);
        updateRemoteDeckVisibility(1);
        return;
    }

    if (!seriesList || seriesList.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucune série trouvée.</div>';
        updateRemoteDeckVisibility(0);
        return;
    }

    seriesList.forEach(serie => {
        const card = document.createElement('div');
        card.className = 'serie-card';
        card.dataset.serieId = serie.id;

        const posterUrl = serie.affiche_path
            ? `https://image.tmdb.org/t/p/w500${serie.affiche_path}`
            : null;

        card.innerHTML = `
            <div class="card-poster">
                ${posterUrl 
                    ? `<img src="${posterUrl}" alt="Affiche de ${serie.titre}" loading="lazy">` 
                    : `<div class="poster-placeholder"><span>🎬</span></div>`
                }
            </div>
            <div class="card-content">
                <div class="card-header">
                    <h2 class="serie-title">${serie.titre}</h2>
                </div>
                ${serie.plateforme ? `<div class="serie-platform-badge">${serie.plateforme}</div>` : ''}
                <p class="serie-synopsis">${serie.synopsis || 'Aucun résumé disponible.'}</p>
                <div class="card-footer">
                    <select
                        class="statut-select"
                        id="statut-${serie.id}"
                        data-serie-id="${serie.id}"
                        data-serie-titre="${serie.titre}"
                        aria-label="Statut de visionnage de ${serie.titre}"
                    >
                        <option value="" disabled ${!serie.statut_visionnage ? 'selected' : ''}>Classer cette série…</option>
                        ${STATUTS_VISIONNAGE.map(s => {
                            const label = s === 'Sans intérêt' ? 'Ignorée' : (s === 'A voir' ? 'À voir' : s);
                            return `<option value="${s}" ${serie.statut_visionnage === s ? 'selected' : ''}>${label}</option>`;
                        }).join('')}
                    </select>
                </div>
            </div>
            <!-- Panneau des saisons (caché par défaut) -->
            <div class="saisons-panel" id="saisons-panel-${serie.id}" hidden>
                <div class="saisons-panel-inner" id="saisons-content-${serie.id}">
                    <div class="saisons-loading">Chargement des saisons...</div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });

    updateRemoteDeckVisibility(seriesList.length);
}

/**
 * Met à jour la visibilité de la télécommande sur mobile.
 */
function updateRemoteDeckVisibility(seriesCount) {
    const isTvMode = currentMode === 'tv';
    const remoteDeck = document.getElementById('remote-deck');
    if (!remoteDeck) return;

    const activeNavBtn = document.querySelector('.nav-btn.active');
    const isInboxTab = activeNavBtn && activeNavBtn.dataset.filter === 'all';
    
    // Si on est en mode télécommande OU (mode PC et onglet Inbox avec des séries)
    if (currentMode === 'remote' || (currentMode === 'pc' && isInboxTab && seriesCount > 0)) {
        remoteDeck.hidden = false;
    } else {
        remoteDeck.hidden = true;
    }
}

```

(Ne pas supprimer la ligne `// ─── GESTION DU CHANGEMENT DE STATUT ───` qui suit — elle a déjà été retirée à la Tâche 5 ; à ce stade il ne doit plus rien rester après la section barre de recherche que la fermeture du fichier.)

- [ ] **Step 4: Vérifier**

Run: `npm test` — Expected: passent.
Run: `npm run build` — Expected: réussit.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ui/state.js src/modules/ui/catalogRender.js src/modules/ui.js
git commit -m "refactor: extrait l'etat partage et le rendu du catalogue dans ui/state.js et ui/catalogRender.js"
```

---

### Task 7: Extraire `ui/searchBar.js`

**Files:**
- Create: `src/modules/ui/searchBar.js`
- Modify: `src/modules/ui.js`

**Interfaces:**
- Consumes: `rechercherSeriesTMDB, synchroniserSerieAvecTMDB, fetchSeries` depuis `../series.js`.
- Produces: `initSearchBar()` — export nommé, appelé une fois depuis `initUI()`.

- [ ] **Step 1: Créer `src/modules/ui/searchBar.js`**

```js
import { rechercherSeriesTMDB, synchroniserSerieAvecTMDB, fetchSeries } from '../series.js';

const TMDB_POSTER_THUMB = 'https://image.tmdb.org/t/p/w92';

/** Délai debounce avant l'appel TMDB (ms) */
const SEARCH_DEBOUNCE_MS = 350;

/** Index du élément actuellement focusé dans la liste de suggestions (-1 = aucun) */
let _activeIndex = -1;

/** Timer debounce */
let _debounceTimer = null;

/**
 * Initialise la barre de recherche et toute son interactivité.
 */
export function initSearchBar() {
    const input       = document.getElementById('serie-search');
    const clearBtn    = document.getElementById('search-clear');
    const statusEl    = document.getElementById('search-status');
    const suggestions = document.getElementById('search-suggestions');

    if (!input) return;

    // ── Saisie : déclenche la recherche debounce ée ────────────────
    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.hidden = q.length === 0;
        clearDebounce();

        if (q.length < 2) {
            fermerSuggestions(suggestions, input, statusEl);
            return;
        }

        setSearchStatus(statusEl, 'loading', '');
        _debounceTimer = setTimeout(() => lancerRecherche(q, input, suggestions, statusEl), SEARCH_DEBOUNCE_MS);
    });

    // ── Clavier : navigation flèches + Escape ───────────────────
    input.addEventListener('keydown', (e) => {
        const items = suggestions.querySelectorAll('.suggestion-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _activeIndex = Math.min(_activeIndex + 1, items.length - 1);
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _activeIndex = Math.max(_activeIndex - 1, 0);
            updateActiveItem(items);
        } else if (e.key === 'Enter' && _activeIndex >= 0) {
            e.preventDefault();
            items[_activeIndex].click();
        } else if (e.key === 'Escape') {
            fermerSuggestions(suggestions, input, statusEl);
        }
    });

    // ── Bouton effacer ──────────────────────────────────
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.hidden = true;
        fermerSuggestions(suggestions, input, statusEl);
        input.focus();
    });

    // ── Clic en dehors : ferme les suggestions ────────────────
    document.addEventListener('click', (e) => {
        if (!document.getElementById('search-bar').contains(e.target)) {
            fermerSuggestions(suggestions, input, statusEl);
        }
    });
}

/**
 * Exécute la recherche TMDB et affiche les suggestions.
 */
async function lancerRecherche(query, input, suggestions, statusEl) {
    try {
        const resultats = await rechercherSeriesTMDB(query);

        if (input.value.trim() !== query) return; // Saisie changée entre temps

        if (resultats.length === 0) {
            setSearchStatus(statusEl, 'empty', 'Aucune série trouvée.');
            fermerSuggestions(suggestions, input);
            return;
        }

        setSearchStatus(statusEl, '', '');
        afficherSuggestions(resultats, suggestions, input, statusEl);

    } catch (err) {
        console.error('[SEARCH]', err);
        setSearchStatus(statusEl, 'error', 'Erreur de recherche.');
    }
}

/**
 * Construit et affiche le dropdown de suggestions.
 */
function afficherSuggestions(resultats, suggestions, input, statusEl) {
    _activeIndex = -1;
    suggestions.innerHTML = '';

    resultats.forEach((r, i) => {
        const li = document.createElement('li');
        li.className  = 'suggestion-item';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.dataset.index = i;

        const posterSrc = r.affiche_path
            ? `${TMDB_POSTER_THUMB}${r.affiche_path}`
            : null;

        li.innerHTML = `
            <div class="suggestion-poster">
                ${posterSrc
                    ? `<img src="${posterSrc}" alt="" loading="lazy">`
                    : `<div class="suggestion-poster--empty">🎬</div>`
                }
            </div>
            <div class="suggestion-info">
                <span class="suggestion-titre">${r.titre}</span>
                ${r.titre_orig ? `<span class="suggestion-titre-orig">${r.titre_orig}</span>` : ''}
                <span class="suggestion-annee">${r.annee}</span>
            </div>
            <div class="suggestion-add" aria-hidden="true">+</div>
        `;

        // Hover souris
        li.addEventListener('mouseenter', () => {
            _activeIndex = i;
            updateActiveItem(suggestions.querySelectorAll('.suggestion-item'));
        });

        // Clic : import + fermeture
        li.addEventListener('click', () => importerSuggestion(r, input, suggestions, statusEl));

        suggestions.appendChild(li);
    });

    suggestions.hidden = false;
    input.setAttribute('aria-expanded', 'true');
}

/**
 * Met à jour la classe "active" sur l'élément sélectionné au clavier.
 */
function updateActiveItem(items) {
    items.forEach((item, idx) => {
        const active = idx === _activeIndex;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
        if (active) item.scrollIntoView({ block: 'nearest' });
    });
}

/**
 * Importe la série sélectionnée, puis rafraîchit le catalogue.
 */
async function importerSuggestion(suggestion, input, suggestions, statusEl) {
    fermerSuggestions(suggestions, input);
    input.value = '';
    document.getElementById('search-clear').hidden = true;

    setSearchStatus(statusEl, 'loading', `⏳ Synchronisation de « ${suggestion.titre} »…`);

    try {
        await synchroniserSerieAvecTMDB(suggestion.tmdbId);
        setSearchStatus(statusEl, 'success', `✅ « ${suggestion.titre} » ajoutée !`);
        await fetchSeries();
        // Efface le message de succès après 3s
        setTimeout(() => setSearchStatus(statusEl, '', ''), 3000);
    } catch (err) {
        console.error('[IMPORT]', err);
        setSearchStatus(statusEl, 'error', `❌ ${err.message || 'Erreur d’importation.'}`);
    }
}

/**
 * Ferme le panneau de suggestions et réinitialise l'index actif.
 */
function fermerSuggestions(suggestions, input, statusEl) {
    suggestions.hidden = true;
    suggestions.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    _activeIndex = -1;
    if (statusEl) setSearchStatus(statusEl, '', '');
    clearDebounce();
}

function clearDebounce() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = null;
}

/**
 * Met à jour l'élément de statut (spinner, succès, erreur, vide).
 */
function setSearchStatus(el, type, message) {
    if (!el) return;
    el.textContent = message;
    el.className   = type ? `search-bar__status search-bar__status--${type}` : 'search-bar__status';
}
```

- [ ] **Step 2: Dans `src/modules/ui.js`, retirer la barre de recherche et ajouter l'import**

Remplacer l'import (retirer `synchroniserSerieAvecTMDB`, `rechercherSeriesTMDB` de `./series.js` — plus utilisés directement dans `ui.js` après cette tâche) :

Remplacer :

```js
import {
    filterSeries,
    fetchSeries,
    updateStatutGlobal,
    synchroniserSerieAvecTMDB,
    rechercherSeriesTMDB,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { state } from './ui/state.js';
import { renderSeries } from './ui/catalogRender.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { fermerModal, onConfirmerModal } from './ui/modal.js';
import { onStatutChange, onSaisonStatutChange } from './ui/statusHandlers.js';
```

par :

```js
import {
    filterSeries,
    fetchSeries,
    updateStatutGlobal,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { state } from './ui/state.js';
import { renderSeries } from './ui/catalogRender.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { fermerModal, onConfirmerModal } from './ui/modal.js';
import { onStatutChange, onSaisonStatutChange } from './ui/statusHandlers.js';
import { initSearchBar } from './ui/searchBar.js';
```

Supprimer entièrement ce bloc en fin de fichier (section barre de recherche TMDB) :

```js
// ─────────────────────────────────────────────
// BARRE DE RECHERCHE TMDB
// ─────────────────────────────────────────────

const TMDB_POSTER_THUMB = 'https://image.tmdb.org/t/p/w92';

/** Délai debounce avant l'appel TMDB (ms) */
const SEARCH_DEBOUNCE_MS = 350;

/** Index du élément actuellement focusé dans la liste de suggestions (-1 = aucun) */
let _activeIndex = -1;

/** Timer debounce */
let _debounceTimer = null;

/**
 * Initialise la barre de recherche et toute son interactivité.
 */
function initSearchBar() {
    const input       = document.getElementById('serie-search');
    const clearBtn    = document.getElementById('search-clear');
    const statusEl    = document.getElementById('search-status');
    const suggestions = document.getElementById('search-suggestions');

    if (!input) return;

    // ── Saisie : déclenche la recherche debounce ée ────────────────
    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.hidden = q.length === 0;
        clearDebounce();

        if (q.length < 2) {
            fermerSuggestions(suggestions, input, statusEl);
            return;
        }

        setSearchStatus(statusEl, 'loading', '');
        _debounceTimer = setTimeout(() => lancerRecherche(q, input, suggestions, statusEl), SEARCH_DEBOUNCE_MS);
    });

    // ── Clavier : navigation flèches + Escape ───────────────────
    input.addEventListener('keydown', (e) => {
        const items = suggestions.querySelectorAll('.suggestion-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _activeIndex = Math.min(_activeIndex + 1, items.length - 1);
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _activeIndex = Math.max(_activeIndex - 1, 0);
            updateActiveItem(items);
        } else if (e.key === 'Enter' && _activeIndex >= 0) {
            e.preventDefault();
            items[_activeIndex].click();
        } else if (e.key === 'Escape') {
            fermerSuggestions(suggestions, input, statusEl);
        }
    });

    // ── Bouton effacer ──────────────────────────────────
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.hidden = true;
        fermerSuggestions(suggestions, input, statusEl);
        input.focus();
    });

    // ── Clic en dehors : ferme les suggestions ────────────────
    document.addEventListener('click', (e) => {
        if (!document.getElementById('search-bar').contains(e.target)) {
            fermerSuggestions(suggestions, input, statusEl);
        }
    });
}

/**
 * Exécute la recherche TMDB et affiche les suggestions.
 */
async function lancerRecherche(query, input, suggestions, statusEl) {
    try {
        const resultats = await rechercherSeriesTMDB(query);

        if (input.value.trim() !== query) return; // Saisie changée entre temps

        if (resultats.length === 0) {
            setSearchStatus(statusEl, 'empty', 'Aucune série trouvée.');
            fermerSuggestions(suggestions, input);
            return;
        }

        setSearchStatus(statusEl, '', '');
        afficherSuggestions(resultats, suggestions, input, statusEl);

    } catch (err) {
        console.error('[SEARCH]', err);
        setSearchStatus(statusEl, 'error', 'Erreur de recherche.');
    }
}

/**
 * Construit et affiche le dropdown de suggestions.
 */
function afficherSuggestions(resultats, suggestions, input, statusEl) {
    _activeIndex = -1;
    suggestions.innerHTML = '';

    resultats.forEach((r, i) => {
        const li = document.createElement('li');
        li.className  = 'suggestion-item';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.dataset.index = i;

        const posterSrc = r.affiche_path
            ? `${TMDB_POSTER_THUMB}${r.affiche_path}`
            : null;

        li.innerHTML = `
            <div class="suggestion-poster">
                ${posterSrc
                    ? `<img src="${posterSrc}" alt="" loading="lazy">`
                    : `<div class="suggestion-poster--empty">🎬</div>`
                }
            </div>
            <div class="suggestion-info">
                <span class="suggestion-titre">${r.titre}</span>
                ${r.titre_orig ? `<span class="suggestion-titre-orig">${r.titre_orig}</span>` : ''}
                <span class="suggestion-annee">${r.annee}</span>
            </div>
            <div class="suggestion-add" aria-hidden="true">+</div>
        `;

        // Hover souris
        li.addEventListener('mouseenter', () => {
            _activeIndex = i;
            updateActiveItem(suggestions.querySelectorAll('.suggestion-item'));
        });

        // Clic : import + fermeture
        li.addEventListener('click', () => importerSuggestion(r, input, suggestions, statusEl));

        suggestions.appendChild(li);
    });

    suggestions.hidden = false;
    input.setAttribute('aria-expanded', 'true');
}

/**
 * Met à jour la classe "active" sur l'élément sélectionné au clavier.
 */
function updateActiveItem(items) {
    items.forEach((item, idx) => {
        const active = idx === _activeIndex;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
        if (active) item.scrollIntoView({ block: 'nearest' });
    });
}

/**
 * Importe la série sélectionnée, puis rafraîchit le catalogue.
 */
async function importerSuggestion(suggestion, input, suggestions, statusEl) {
    fermerSuggestions(suggestions, input);
    input.value = '';
    document.getElementById('search-clear').hidden = true;

    setSearchStatus(statusEl, 'loading', `⏳ Synchronisation de « ${suggestion.titre} »…`);

    try {
        await synchroniserSerieAvecTMDB(suggestion.tmdbId);
        setSearchStatus(statusEl, 'success', `✅ « ${suggestion.titre} » ajoutée !`);
        await fetchSeries();
        // Efface le message de succès après 3s
        setTimeout(() => setSearchStatus(statusEl, '', ''), 3000);
    } catch (err) {
        console.error('[IMPORT]', err);
        setSearchStatus(statusEl, 'error', `❌ ${err.message || 'Erreur d’importation.'}`);
    }
}

/**
 * Ferme le panneau de suggestions et réinitialise l'index actif.
 */
function fermerSuggestions(suggestions, input, statusEl) {
    suggestions.hidden = true;
    suggestions.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    _activeIndex = -1;
    if (statusEl) setSearchStatus(statusEl, '', '');
    clearDebounce();
}

function clearDebounce() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = null;
}

/**
 * Met à jour l'élément de statut (spinner, succès, erreur, vide).
 */
function setSearchStatus(el, type, message) {
    if (!el) return;
    el.textContent = message;
    el.className   = type ? `search-bar__status search-bar__status--${type}` : 'search-bar__status';
}

```

(L'appel `initSearchBar();` en toute fin de `initUI()` reste inchangé — il résout maintenant vers l'import.)

- [ ] **Step 3: Vérifier**

Run: `npm test` — Expected: passent.
Run: `npm run build` — Expected: réussit.

- [ ] **Step 4: Commit**

```bash
git add src/modules/ui/searchBar.js src/modules/ui.js
git commit -m "refactor: extrait la barre de recherche TMDB dans ui/searchBar.js"
```

---

### Task 8: Finaliser l'orchestrateur et vérifier de bout en bout

**Files:**
- Modify: `src/modules/ui.js` (aucun changement de code attendu — vérification que le fichier ne contient plus que les imports + `initUI()`)
- Modify: `src/modules/series.js`

**Interfaces:**
- `series.js` importe désormais `renderSeries` et `renderFetchError` directement depuis `./modules/ui/catalogRender.js` au lieu de `./ui.js`, supprimant un niveau d'indirection devenu inutile.

- [ ] **Step 1: Vérifier le contenu final de `src/modules/ui.js`**

À ce stade, `src/modules/ui.js` doit contenir uniquement :

```js
import {
    filterSeries,
    fetchSeries,
    updateStatutGlobal,
    setPlatformFilter,
    initRealtimeZapping,
    diffuserSignalLancement,
    diffuserSignalPreview,
    MOCK_USER_ID,
} from './series.js';
import { state } from './ui/state.js';
import { renderSeries } from './ui/catalogRender.js';
import { toggleSaisonsPanel } from './ui/saisonsPanel.js';
import { fermerModal, onConfirmerModal } from './ui/modal.js';
import { onStatutChange, onSaisonStatutChange } from './ui/statusHandlers.js';
import { initSearchBar } from './ui/searchBar.js';

export function initUI() {
    // ... corps inchangé depuis la Tâche 6, utilisant state.* partout ...
}
```

Si le fichier contient encore autre chose (bloc de code non déplacé, import inutilisé), corriger avant de continuer.

- [ ] **Step 2: Dans `src/modules/series.js`, rediriger l'import de rendu**

Remplacer :

```js
import { renderSeries, renderFetchError } from './ui.js';
```

par :

```js
import { renderSeries, renderFetchError } from './ui/catalogRender.js';
```

- [ ] **Step 3: Vérifier automatiquement**

Run: `npm test` — Expected: 6 tests passent.
Run: `npm run build` — Expected: réussit sans erreur.

- [ ] **Step 4: Vérification manuelle en navigateur**

Lancer le serveur de dev :

```bash
npm run dev
```

Ouvrir `http://localhost:5173`, puis vérifier dans l'ordre :
1. Mode PC : le catalogue se charge (onglet « Toutes »), les cartes affichent poster/titre/synopsis/select de statut.
2. Rechercher une série dans la barre de recherche (ex : « Breaking Bad ») → suggestions affichées, import fonctionne, toast de succès.
3. Changer le statut d'une série vers « Abandonnée » ou « En cours » (nouvelle série) → le modal générique s'ouvre, la confirmation fonctionne, `fetchSeries()` recharge le catalogue.
4. Cliquer sur une carte pour ouvrir l'accordéon des saisons → la liste se charge, changer un statut de saison fonctionne.
5. Retour à l'accueil (recharger la page), choisir « Mode TV » → l'interface TV s'affiche, le fond cinéma apparaît si une série a un backdrop.
6. Retour à l'accueil, choisir « Télécommande » → les boutons NON/PEUT-ÊTRE/OUI apparaissent et retirent la carte active du deck au clic.
7. Vérifier dans la console qu'aucune erreur JS n'apparaît (`read_console_messages` ou onglet Console du navigateur).

Si un comportement diffère de celui documenté dans l'audit initial, corriger la régression avant de committer.

- [ ] **Step 5: Commit final**

```bash
git add src/modules/ui.js src/modules/series.js
git commit -m "refactor: finalise ui.js comme orchestrateur et redirige series.js vers ui/catalogRender.js"
```

- [ ] **Step 6: Push**

Demander confirmation à l'utilisateur avant de pousser (le push déclenche un déploiement prod automatique via l'intégration Git de Vercel), puis :

```bash
git push origin main
```
