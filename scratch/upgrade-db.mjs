import https from 'https';

const PAT   = 'SUPABASE_PERSONAL_ACCESS_TOKEN';
const REF   = 'flvvjlytntnethjyyuix';

const SQL = `
-- 1. Ajouter la colonne plateforme
ALTER TABLE series ADD COLUMN IF NOT EXISTS plateforme VARCHAR(100);

-- 2. Configurer la publication Realtime
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Essayer d'ajouter la table. Si déjà présente, pg_publication_rel gère ça.
-- On le fait via un bloc anonyme pour éviter les crashs si déjà ajoutée.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE utilisateur_series;
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
    WHEN OTHERS THEN
        -- Si la relation existe déjà sous une autre forme
        IF SQLSTATE = '42710' THEN
            NULL;
        ELSE
            RAISE;
        END IF;
END $$;
`;

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

(async () => {
    console.log('🚀 Démarrage de la mise à jour de la base de données...');
    const result = await apiQuery(SQL);
    console.log(`Status HTTP : ${result.status}`);

    if (result.status === 200 || result.status === 201 || result.status === 204) {
        console.log('✅ Base de données mise à jour avec succès (Realtime + Colonne plateforme) !');
    } else {
        console.error('❌ Erreur de mise à jour :', JSON.stringify(result.body, null, 2));
    }
})();
