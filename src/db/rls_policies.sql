-- ============================================================================
-- POLITIQUES RLS : SéréniTV — état réel en production
-- ============================================================================
-- Stratégie effective (verrouillée) :
--   • Tables Catalogue (series, saisons, themes, series_themes) :
--     Lecture publique (anon, authenticated). Écriture : AUCUNE policy anon —
--     uniquement via les Edge Functions (service_role, qui contourne RLS).
--
--   • Tables Utilisateur (utilisateur_series, utilisateur_saisons) :
--     Lecture publique (identité partagée MOCK_USER_ID, pas d'auth réelle —
--     voir supabase/functions/). Écriture : AUCUNE policy anon — uniquement
--     via l'Edge Function update-user-status (service_role).
--
--   Ne PAS réintroduire de policy "FOR ALL ... USING (true)" sur les tables
--   utilisateur ou catalogue : c'est exactement la faille qui a été corrigée
--   (n'importe qui avec la clé anon pouvait écrire/supprimer les données de
--   tous les utilisateurs). Toute écriture doit passer par une Edge Function.
-- ============================================================================

-- ── 1. Activer RLS sur toutes les tables (si pas déjà fait) ─────────────────
ALTER TABLE series              ENABLE ROW LEVEL SECURITY;
ALTER TABLE saisons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_themes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_series  ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_saisons ENABLE ROW LEVEL SECURITY;

-- ── 2. Catalogue : Lecture publique ─────────────────────────────────────────
CREATE POLICY "catalogue_select_public"
    ON series FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "saisons_select_public"
    ON saisons FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "themes_select_public"
    ON themes FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "series_themes_select_pub"
    ON series_themes FOR SELECT
    TO anon, authenticated
    USING (true);

-- ── 3. Catalogue : écriture — PAS de policy anon/authenticated ─────────────
-- Les upserts (sync-serie) passent par l'Edge Function avec service_role,
-- qui contourne RLS. Ne pas ajouter de policy d'écriture ici.

-- ── 4. Suivi utilisateur : Lecture publique ─────────────────────────────────
-- (identité partagée MOCK_USER_ID en attendant une authentification réelle —
-- accepté comme risque mineur : ces tables ne contiennent que des statuts de
-- visionnage, rien de sensible)
CREATE POLICY "user_series_select_public"
    ON utilisateur_series FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "user_saisons_select_public"
    ON utilisateur_saisons FOR SELECT
    TO anon, authenticated
    USING (true);

-- ── 5. Suivi utilisateur : écriture — PAS de policy anon/authenticated ─────
-- Tous les changements de statut passent par l'Edge Function
-- update-user-status avec service_role. Ne pas ajouter de policy d'écriture
-- ici : c'est précisément ce qui permettait à n'importe qui de modifier les
-- données de n'importe quel utilisateur avant la correction de sécurité.
