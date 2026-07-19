# Numéro de version discret + notes de version

## Contexte

L'utilisateur souhaite instaurer une pratique de versionnage à partir de maintenant, avec un numéro de version visible discrètement dans l'app, cliquable pour consulter les notes de version (changelog).

## Emplacement et interaction

- Petit texte `v{version}` (ex: `v1.1.0`), position fixe **en bas à gauche** — symétrique au bouton de réinitialisation du rôle d'appareil (`#btn-reset-mode`, en haut à droite), visible dans les 3 modes (PC/TV/Télécommande).
- Opacité réduite au repos (0.4), pleine opacité au survol/focus — même traitement discret que le bouton de réinitialisation.
- Clic → ouvre un panneau modal dédié aux notes de version.

## Notes de version (changelog)

- Panneau modal réutilisant le langage visuel du modal existant (`.modal-overlay` assombri + flou, `.modal`/`.modal-content` centrés) mais dans des éléments DOM séparés (`#changelog-overlay`/`#changelog-modal`), pour ne pas interférer avec le modal générique abandon/démarrage déjà câblé sur `#modal-overlay`.
- Liste des versions, la plus récente en premier, chacune avec : numéro de version, date, liste à puces des changements.
- Fermeture : bouton dédié + clic sur l'overlay (même pattern que le modal existant).

## Source de vérité unique

Nouveau fichier `src/modules/changelogData.js` (donnée pure, sans DOM) :

```js
export const CHANGELOG = [
    {
        version: '1.1.0',
        date: '2026-07-19',
        changes: [
            "Mise en place du versionnage de l'application, avec notes de version consultables.",
        ],
    },
];

export const APP_VERSION = CHANGELOG[0].version;
```

`APP_VERSION` est dérivé de la première entrée du tableau — badge affiché et changelog ne peuvent jamais diverger. C'est le seul fichier à modifier pour publier une nouvelle version : ajouter une entrée en tête du tableau.

## Architecture

Nouveau module `src/modules/ui/changelog.js` (DOM uniquement, suit le découpage par responsabilité déjà en place dans `src/modules/ui/`) :
- `initChangelogBadge()` — affiche `APP_VERSION` dans le badge, câble le clic pour ouvrir/fermer le panneau, génère le rendu de la liste depuis `CHANGELOG` au premier affichage.

Appelé depuis `initUI()` dans `ui.js`, au même niveau que `initSearchBar()`.

## Point corrigé au passage (auto-relecture)

`#btn-reset-mode` a été créé avec `z-index: 500`, supérieur au `.modal-overlay`/`.modal` existants (100/101) : le bouton de réinitialisation resterait visuellement au-dessus (et cliquable à travers) un modal ouvert. En ajoutant un second modal (changelog) avec le même souci potentiel, on corrige les deux boutons flottants (`#btn-reset-mode` et le nouveau badge de version) à `z-index: 50` — sous les deux modals (100/101), toujours au-dessus du fond `.tv-backdrop-bg` (0) et du contenu normal.

## Hors périmètre

- Pas de synchronisation automatique avec `package.json` — `changelogData.js` est la seule source pour l'UI. `package.json` peut être bumpé en parallèle par convention (cohérence npm/outils), mais ce n'est pas requis pour que l'affichage fonctionne.
- Pas de reconstitution rétroactive des changements antérieurs à cette fonctionnalité (décidé avec l'utilisateur) : le changelog démarre à `1.1.0`.
- Aucun changement de comportement des fonctionnalités existantes.

## Convention pour la suite (à documenter dans CLAUDE.md)

À chaque changement notable livré : ajouter une entrée en tête de `CHANGELOG` dans `changelogData.js` (nouveau numéro de version, date du jour, description courte), et bumper `package.json`.

## Tests

- Pas de logique métier complexe à tester unitairement (donnée statique + rendu DOM simple). Vérification manuelle en navigateur : badge visible et correct dans les 3 modes, ouverture/fermeture du panneau, contenu affiché correspond à `CHANGELOG`.
