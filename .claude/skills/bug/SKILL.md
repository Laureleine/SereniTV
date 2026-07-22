---
name: bug
description: Use when the user types /bug, says "bug", or pastes a bug/feedback description for SéréniTV and wants it triaged and fixed following the project's standard bug-handling routine (fetch from the Kanban, fix, deploy, update the card).
---

# /bug — Traiter un bug du Kanban SéréniTV

## Déclenchement

- **`/bug` ou "bug"** : va chercher toi-même le bug à traiter (étape 1).
- **L'utilisateur colle une description de bug directement** : saute l'étape 1, applique la même routine à partir de l'étape 2 sur ce contenu (il n'a pas forcément de carte Kanban associée — si aucun `id` n'est fourni, tu peux créer la carte toi-même en `statut = 'En cours'` directement).

Projet Supabase : `flvvjlytntnethjyyuix`. Tables : `retours_utilisateurs` (id, type, titre, description, statut) et `retours_commentaires` (retour_id, auteur `'utilisateur'|'assistant'`, message, created_at). Toutes les lectures/écritures se font directement via les outils MCP Supabase (execute_sql / apply_migration) — les policies RLS ne bloquent pas cet accès, il n'y a pas besoin de passer par l'appli cliente.

## Étapes

1. **Sélection** (uniquement si déclenché par `/bug`, pas par un copier-coller direct)
   Requête : `type = 'Bug' AND statut = 'Prévu'`, triée par `created_at` croissant (le plus ancien en premier — pas encore de champ de criticité, à revoir si ce champ est ajouté un jour). Prends la première carte. Si aucune carte ne correspond, dis-le à l'utilisateur et arrête-toi là.

2. **Passage en "En cours"**
   Mets à jour `statut = 'En cours'` sur cette carte immédiatement, avant toute analyse.

3. **Vérifie que tu as tout ce qu'il faut**
   - Si oui → étape 4.
   - Si non → insère un commentaire `auteur = 'assistant'` sur la carte avec tes questions, dans un langage clair et non technique (pas de jargon). Préviens l'utilisateur en conversation que des questions attendent sur la carte, puis **arrête-toi** : n'avance pas tant qu'il n'a pas répondu (sa réponse apparaîtra en `auteur = 'utilisateur'` sur la même carte).

4. **Corrige le bug**
   Suis les conventions habituelles du projet (tests, build, vérification en live avant de considérer que c'est fait — voir CLAUDE.md).

5. **Déploie**
   Commit, puis pousse sur `origin/main` (déclenche Vercel). Confirme que le déploiement s'est bien passé avant de continuer.

6. **Mets à jour la carte**
   Une fois en prod : ajoute un commentaire `auteur = 'assistant'` décrivant la correction en langage clair pour l'utilisateur (pas technique), puis passe `statut = 'Fait'`.

7. **REX pour toi-même**
   Note dans ta mémoire persistante (fichier projet SéréniTV) tout piège ou subtilité découvert pendant cette correction — pas sur la carte, pas visible pour l'utilisateur. Objectif : ne pas retomber dans le même panneau la prochaine fois.

8. **Proposition d'évolution (facultatif)**
   Si la correction suggère naturellement une amélioration, tu peux créer une nouvelle carte (`type = 'Idée'`, `statut = 'Idées'`) pour la proposer. Pas systématique — vas-y seulement si l'idée est réellement pertinente.
