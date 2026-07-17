import https from 'https';

const PAT   = 'SUPABASE_PERSONAL_ACCESS_TOKEN';
const REF   = 'flvvjlytntnethjyyuix';

// ─── SQL à exécuter ────────────────────────────────────────────────────────
const SQL = `
-- 1. Activer RLS sur toutes les tables
ALTER TABLE series              ENABLE ROW LEVEL SECURITY;
ALTER TABLE saisons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_themes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_series  ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateur_saisons ENABLE ROW LEVEL SECURITY;

-- 2. Catalogue : Lecture publique
CREATE POLICY "catalogue_select_public"   ON series        FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "saisons_select_public"     ON saisons       FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "themes_select_public"      ON themes        FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "series_themes_select_pub"  ON series_themes FOR SELECT TO anon, authenticated USING (true);

-- 3. Catalogue : Écriture permissive MVP
CREATE POLICY "catalogue_write_mvp"       ON series        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "saisons_write_mvp"         ON saisons       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "themes_write_mvp"          ON themes        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "series_themes_write_mvp"   ON series_themes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. Tables utilisateur : Permissif MVP
CREATE POLICY "user_series_all_mvp"   ON utilisateur_series  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "user_saisons_all_mvp"  ON utilisateur_saisons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
`;

// ─── Appel Management API ──────────────────────────────────────────────────
function apiQuery(sql) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ query: sql });
        const options = {
            hostname: 'api.supabase.com',
            path:     `/v1/projects/${REF}/database/query`,
            method:   'POST',
            headers:  {
                'Authorization': `Bearer ${PAT}`,
                'Content-Type':  'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── Vérification de l'état RLS après application ──────────────────────────
async function checkRLS() {
    const r = await apiQuery(
        `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`
    );
    console.log('\n── État RLS des tables ────────────────────────────────');
    if (Array.isArray(r.body)) {
        r.body.forEach(row => {
            const icon = row.rowsecurity ? '🔒' : '🔓';
            console.log(`  ${icon}  ${row.tablename.padEnd(25)} RLS = ${row.rowsecurity}`);
        });
    } else {
        console.log(JSON.stringify(r.body, null, 2));
    }
}

// ─── Main ──────────────────────────────────────────────────────────────────
(async () => {
    console.log('🚀 Application des politiques RLS sur Supabase…\n');

    const result = await apiQuery(SQL);
    console.log(`Status HTTP : ${result.status}`);

    if (result.status === 200 || result.status === 204) {
        console.log('✅ Politiques RLS appliquées avec succès !');
    } else {
        console.error('❌ Erreur :', JSON.stringify(result.body, null, 2));
    }

    await checkRLS();
    console.log('\n✅ Terminé. Tu peux maintenant importer des séries dans SéréniTV.');
})();
