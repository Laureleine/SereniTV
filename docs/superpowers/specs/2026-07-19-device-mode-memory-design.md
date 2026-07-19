# Mémorisation du rôle d'appareil (PC / Télé / Télécommande)

## Contexte

SéréniTV est utilisé par 3 acteurs distincts, chacun sur son propre appareil : un PC (usage classique), un téléphone (télécommande de tri rapide), et une télé (affichage passif du catalogue). Aujourd'hui, l'app affiche systématiquement un écran de sélection de mode (`#mode-selection-overlay`) à chaque chargement de page, sur chaque appareil, sans aucune mémoire du choix précédent.

## Objectif

Chaque appareil doit être « reconnu » automatiquement après son premier choix : l'écran de sélection ne doit plus jamais réapparaître sur un appareil qui a déjà choisi son rôle, sauf réinitialisation volontaire.

## Mécanisme retenu

- Persistance via `localStorage` (par appareil/navigateur — c'est justement la propriété recherchée : chaque acteur a son propre stockage local).
- Clé dédiée : `serenitv-device-mode`, valeurs possibles : `'tv'`, `'remote'`, `'pc'`.
- Mémorisation **indéfinie** (pas de session/expiration) jusqu'à réinitialisation manuelle.

## Comportement au démarrage

`initUI()` vérifie `serenitv-device-mode` avant toute autre chose :
- **Clé présente** → l'overlay reste caché (jamais affiché), l'app active directement le mode mémorisé via une fonction commune `activerMode(mode)`.
- **Clé absente** → comportement actuel : l'overlay s'affiche ; le clic sur un bouton appelle `activerMode(mode)` **et** sauvegarde le choix.

`activerMode(mode)` factorise la logique aujourd'hui dupliquée dans les 3 handlers de boutons (`btnTv`/`btnRemote`/`btnPc`) : mise à jour de `state.currentMode`, classes CSS du `body` (`is-tv-mode`/`is-remote-mode`), câblage du temps réel (`initRealtimeZapping`) si mode TV, puis `fetchSeries()`.

## Réinitialisation

Un bouton flottant discret, présent et identique dans les 3 modes : caractère `↺` seul, petit bouton circulaire, position fixe **en haut à droite** de l'écran (coin libre dans les 3 modes — n'entre en collision ni avec le `remote-deck` ni avec les toasts, tous deux en bas), opacité réduite au repos (ex: 0.35) et pleine opacité au survol/focus. Hors du `<header>`, puisque le mode TV et le mode Télécommande masquent déjà le header via CSS (`.is-tv-mode header`, `.is-remote-mode header` → `display: none`).

Au clic : effet immédiat, sans confirmation (action à faible enjeu et facilement réversible) — efface la clé `serenitv-device-mode` et recharge la page (`location.reload()`). L'overlay de sélection réapparaît alors normalement.

## Architecture

Nouveau module `src/modules/ui/deviceMode.js`, cohérent avec le découpage par responsabilité déjà en place dans `src/modules/ui/` :

```js
const STORAGE_KEY = 'serenitv-device-mode';

export function getSavedMode() { /* localStorage.getItem, valide contre ['tv','remote','pc'] */ }
export function saveMode(mode) { /* localStorage.setItem */ }
export function clearSavedMode() { /* localStorage.removeItem */ }
```

Logique pure (lecture/écriture localStorage + validation), sans dépendance DOM — testable avec un faux `localStorage` en mémoire dans le test, sans nouvelle dépendance npm.

`ui.js` importe ce module, ajoute la fonction `activerMode(mode)`, la vérification au démarrage, et le branchement du bouton de réinitialisation dans `initUI()`.

## Hors périmètre

- Aucun changement de comportement une fois un mode activé (TV/Remote/PC fonctionnent exactement comme aujourd'hui).
- Aucune détection automatique par heuristique (taille d'écran, user-agent) — le choix reste un geste manuel unique, seulement mémorisé ensuite.
- Aucun changement de `index.html`/`main.css` au-delà de l'ajout du bouton de réinitialisation et son style.

## Tests

- Tests Vitest sur `deviceMode.js` (`getSavedMode`/`saveMode`/`clearSavedMode`) avec un faux `localStorage` en mémoire — logique pure, aucune dépendance ajoutée.
- Vérification manuelle en navigateur : recharger une page après avoir choisi un mode ne doit plus afficher l'overlay ; le bouton de réinitialisation doit faire réapparaître l'overlay.
