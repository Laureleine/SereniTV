-- ============================================================================
-- POLITIQUES RLS : SéréniTV MVP
-- ============================================================================
-- Stratégie :
--   • Tables Catalogue (series, saisons, themes, series_themes) :
--     Lecture publique, écriture permissive pour le MVP.
--     → À restreindre au rôle "service_role" en production.
--
--   • Tables Utilisateur (utilisateur_series, utilisateur_saisons) :
--     Permissif pour le MVP (MOCK_USER_ID).
--     → À verrouiller sur auth.uid() = user_id en production.
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

CREATE POLICY "series_themes_select_public"
    ON series_themes FOR SELECT
    TO anon, authenticated
    USING (true);

-- ── 3. Catalogue : Écriture permissive MVP (clé anon autorisée) ─────────────
--    Permet à l'app PWA de synchroniser le catalogue via TMDB.
--    En production : remplacer TO anon par TO service_role uniquement.
CREATE POLICY "catalogue_write_mvp"
    ON series FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "saisons_write_mvp"
    ON saisons FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "themes_write_mvp"
    ON themes FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "series_themes_write_mvp"
    ON series_themes FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- ── 4. Suivi utilisateur : Permissif MVP (MOCK_USER_ID) ─────────────────────
--    En production : remplacer USING (true) par USING (auth.uid() = user_id)
CREATE POLICY "user_series_all_mvp"
    ON utilisateur_series FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "user_saisons_all_mvp"
    ON utilisateur_saisons FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
