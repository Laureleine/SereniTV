import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// 1. Charger et parser les clés d'accès depuis le fichier .env local
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        env[key] = value;
    }
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const TMDB_ACCESS_TOKEN = env.TMDB_ACCESS_TOKEN;
const SERENITV_AUTH_EMAIL = env.SERENITV_AUTH_EMAIL;
const SERENITV_AUTH_PASSWORD = env.SERENITV_AUTH_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TMDB_ACCESS_TOKEN) {
    console.error('❌ Variables d\'environnement manquantes dans le fichier .env !');
    process.exit(1);
}
if (!SERENITV_AUTH_EMAIL || !SERENITV_AUTH_PASSWORD) {
    console.error('❌ SERENITV_AUTH_EMAIL / SERENITV_AUTH_PASSWORD manquants dans .env (nécessaires pour appeler les Edge Functions) !');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const EDGE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_HEADERS = {
    'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
    'Content-Type':  'application/json',
};

// Configurer le chemin racine des dossiers locaux
const BASE_PATH = process.argv[2];

if (!BASE_PATH) {
    console.error('❌ Veuillez fournir le chemin absolu du dossier à scanner en paramètre.');
    console.error('Usage: node scratch/sync-local-folders.js "C:\\chemin\\vers\\series"');
    process.exit(1);
}

async function callEdgeFunction(name, payload, accessToken) {
    const response = await fetch(`${EDGE_FUNCTIONS_URL}/${name}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Erreur ${name} (HTTP ${response.status})`);
    return data;
}

function cleanFolderTitle(folderName) {
    let title = folderName;
    // Enlever les balises de début/fin "-=-" ou tirets
    title = title.replace(/^[-=\s]+|[-=\s]+$/g, '');
    // Enlever le préfixe "FRED" si présent
    title = title.replace(/^FRED\s*[-=\s]*/i, '');
    // Couper au premier "Saison" ou "Saisons" (insensible à la casse)
    const indexSaison = title.search(/\bsaisons?\b/i);
    if (indexSaison !== -1) {
        title = title.substring(0, indexSaison);
    }
    // Nettoyer les tirets/espaces restants à la fin
    title = title.replace(/[-=\s]+$/g, '').trim();
    return title;
}

async function searchTVShow(title) {
    try {
        const url = `${TMDB_BASE_URL}/search/tv?query=${encodeURIComponent(title)}&language=fr-FR`;
        const res = await fetch(url, { headers: TMDB_HEADERS });
        if (!res.ok) return null;
        const data = await res.json();
        return data.results && data.results[0] ? data.results[0].id : null;
    } catch (e) {
        return null;
    }
}

async function run() {
    try {
        console.log('🔐 Connexion au compte SéréniTV...');
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: SERENITV_AUTH_EMAIL,
            password: SERENITV_AUTH_PASSWORD,
        });
        if (authError || !authData.session) {
            throw new Error(`Échec de connexion : ${authError?.message || 'session absente'}`);
        }
        const accessToken = authData.session.access_token;
        console.log('✅ Connecté.');

        const absolutePath = path.resolve(BASE_PATH);
        if (!fs.existsSync(absolutePath)) {
            console.error(`❌ Le répertoire spécifié n'existe pas : ${absolutePath}`);
            process.exit(1);
        }

        console.log(`🎬 Démarrage du scan local pour : "${absolutePath}"...\n`);

        const jobs = [];

        // 1. Lister les dossiers racine pour "En cours" (hors dossiers de catégories)
        const rootEntries = fs.readdirSync(absolutePath, { withFileTypes: true });
        rootEntries.forEach(entry => {
            if (entry.isDirectory()) {
                const name = entry.name;
                // Exclure les dossiers de catégories
                if (name.toLowerCase() !== 'séries terminées' &&
                    name.toLowerCase() !== 'series terminees' &&
                    name.toLowerCase() !== 'séries bof' &&
                    name.toLowerCase() !== 'series bof') {
                    jobs.push({ folderName: name, status: 'En cours' });
                }
            }
        });

        // 2. Lister le dossier "Séries Terminées" pour "Terminée"
        const termineesPath = path.join(absolutePath, 'Séries Terminées');
        const termineesPathNoAccent = path.join(absolutePath, 'Series Terminees');
        const termineesDir = fs.existsSync(termineesPath) ? termineesPath
            : (fs.existsSync(termineesPathNoAccent) ? termineesPathNoAccent : null);
        if (termineesDir) {
            fs.readdirSync(termineesDir, { withFileTypes: true }).forEach(entry => {
                if (entry.isDirectory()) jobs.push({ folderName: entry.name, status: 'Terminée' });
            });
        }

        // 3. Lister le dossier "Séries Bof" pour "Abandonnée"
        const bofPath = path.join(absolutePath, 'Séries Bof');
        const bofPathNoAccent = path.join(absolutePath, 'Series Bof');
        const bofDir = fs.existsSync(bofPath) ? bofPath
            : (fs.existsSync(bofPathNoAccent) ? bofPathNoAccent : null);
        if (bofDir) {
            fs.readdirSync(bofDir, { withFileTypes: true }).forEach(entry => {
                if (entry.isDirectory()) jobs.push({ folderName: entry.name, status: 'Abandonnée' });
            });
        }

        console.log(`📋 Total de séries à synchroniser détectées : ${jobs.length}`);

        let syncSuccessCount = 0;

        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            const cleanTitle = cleanFolderTitle(job.folderName);
            console.log(`\n[${i + 1}/${jobs.length}] ⚙️ Traitement de : "${job.folderName}"`);
            console.log(`   👉 Titre nettoyé : "${cleanTitle}" | Statut cible : [${job.status}]`);

            console.log(`   🔎 Recherche TMDB...`);
            const tmdbId = await searchTVShow(cleanTitle);
            if (!tmdbId) {
                console.warn(`   ❌ Non trouvée sur TMDB : "${cleanTitle}"`);
                continue;
            }

            try {
                // 1. Synchroniser la série (récupère les détails TMDB, upsert series/saisons/thèmes)
                const serie = await callEdgeFunction('sync-serie', { tmdbId }, accessToken);

                // 2. Associer le statut utilisateur correspondant (En cours, Terminée, Abandonnée)
                await callEdgeFunction('update-user-status', {
                    action: 'update_statut_global',
                    serieId: serie.id,
                    statut: job.status,
                }, accessToken);

                console.log(`   ✅ Synchronisée : "${serie.titre}" → Statut : [${job.status}]`);
                syncSuccessCount++;
            } catch (err) {
                console.error(`   ❌ Échec de synchronisation :`, err.message);
            }

            // Délai de précaution anti rate-limit
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        console.log(`\n🎉 FIN DE LA SYNCHRONISATION ! ${syncSuccessCount}/${jobs.length} séries ont été importées ou mises à jour avec succès dans Supabase.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Erreur générale de synchronisation :', err);
        process.exit(1);
    }
}

run();
