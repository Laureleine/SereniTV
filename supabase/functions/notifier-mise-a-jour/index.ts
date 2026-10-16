import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Appelée uniquement par le cron pg_cron « notifier-mise-a-jour » (jamais par
// un navigateur) : gardée par le secret interne serveur-à-serveur déjà utilisé
// par le cron d'import hebdomadaire.
//
// Lit /changelog.json sur le site en ligne (généré à chaque build Vite). Si une
// version plus récente que la dernière déjà annoncée y apparaît (= un nouveau
// déploiement Vercel), envoie ses notes aux abonnés puis la marque comme
// annoncée dans notifications_mises_a_jour (jamais deux fois la même).
const INTERNAL_IMPORT_SECRET = Deno.env.get('INTERNAL_IMPORT_SECRET');

const MAILJET_API_KEY = Deno.env.get('MAILJET_API_KEY');
const MAILJET_SECRET_KEY = Deno.env.get('MAILJET_SECRET_KEY');
const MAILJET_SENDER_EMAIL = Deno.env.get('MAILJET_SENDER_EMAIL');
const SITE_URL = 'https://sereni-tv.vercel.app';
const MAILJET_MAX_MESSAGES = 50; // limite par appel /v3.1/send

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

type EntreeChangelog = { version: string; date: string; changes: string[] };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function echapperHtml(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** -1, 0 ou 1 selon que a est plus ancienne, égale ou plus récente que b (format x.y.z). */
function comparerVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/** « 2026-10-16 » → « 16 octobre 2026 ». */
function formaterDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** « 1.7.6, 1.7.5 et 1.7.4 » */
function listerVersions(entrees: EntreeChangelog[]): string {
  const versions = entrees.map(e => e.version);
  return versions.length > 1 ? `${versions.slice(0, -1).join(', ')} et ${versions[versions.length - 1]}` : versions[0];
}

// Couleurs de l'appli (src/styles/main.css) : fond #090b16, bleu néon #00f0ff,
// violet électrique #a855f7. Les dégradés ont une couleur unie de repli
// (bgcolor / background-color) pour les messageries qui les ignorent (Outlook).
const DEGRADE = 'linear-gradient(135deg, #00f0ff 0%, #a855f7 100%)';

function construireEmailHtml(entrees: EntreeChangelog[]): string {
  // Le détail de la dernière version seulement ; les précédentes, si plusieurs
  // se sont accumulées, sont simplement citées (notes complètes dans l'appli).
  const [derniere, ...precedentes] = entrees;
  const pointsHtml = derniere.changes.map(c => `
                <tr>
                  <td width="22" valign="top" style="padding:0 0 12px; color:#00f0ff; font-size:16px; line-height:1.5;">✦</td>
                  <td valign="top" style="padding:0 0 12px; color:#c9cce0; font-size:15px; line-height:1.5;">${echapperHtml(c)}</td>
                </tr>`).join('');
  const precedentesHtml = precedentes.length === 0 ? '' : `
          <tr>
            <td style="padding:4px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#11142a; border:1px solid #2A2D40; border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px; color:#9297b3; font-size:13px; line-height:1.5;">
                    Également depuis le dernier email : ${precedentes.length > 1 ? 'versions' : 'version'} <strong style="color:#E8EAF6;">${echapperHtml(listerVersions(precedentes))}</strong>.
                    Toutes les notes sont dans l'appli, en touchant le numéro de version.
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

  return `
<div style="background-color:#090b16; padding:32px 12px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background-color:#1A1D2E; border:1px solid #2A2D40; border-radius:16px; overflow:hidden;">
    <tr>
      <td bgcolor="#5B7CF8" style="background-color:#5B7CF8; background-image:${DEGRADE}; padding:22px 32px; text-align:center;">
        <img src="${SITE_URL}/icon-192.png" width="56" height="56" alt="" style="display:block; margin:0 auto 10px; border-radius:14px; border:0;">
        <span style="color:#090b16; font-size:20px; font-weight:800; letter-spacing:0.5px;">SéréniTV</span>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px 6px; text-align:center;">
        <h1 style="color:#E8EAF6; font-size:22px; font-weight:800; margin:0;">Quoi de neuf ?</h1>
        <p style="margin:8px 0 0; font-size:14px; color:#9297b3;">
          <span style="color:#00f0ff; font-weight:700;">Version ${echapperHtml(derniere.version)}</span> · ${echapperHtml(formaterDate(derniere.date))}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${pointsHtml}
        </table>
      </td>
    </tr>${precedentesHtml}
    <tr>
      <td style="padding:24px 32px 8px; text-align:center;">
        <a href="${SITE_URL}" style="display:inline-block; background-color:#5B7CF8; background-image:${DEGRADE}; color:#090b16; text-decoration:none; font-weight:800; font-size:15px; padding:13px 32px; border-radius:999px;">Ouvrir SéréniTV</a>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 26px; text-align:center; color:#6b6f8a; font-size:12px; line-height:1.5;">
        Vous recevez cet email car vous êtes abonné aux nouveautés de SéréniTV.<br>
        Pour ne plus les recevoir : bouton 👤 « Mon compte » dans l'application.
      </td>
    </tr>
  </table>
</div>`;
}

function construireEmailTexte(entrees: EntreeChangelog[]): string {
  const [derniere, ...precedentes] = entrees;
  const lignes = [
    'Quoi de neuf sur SéréniTV ?',
    '',
    `Version ${derniere.version} (${formaterDate(derniere.date)})`,
    ...derniere.changes.map(c => `- ${c}`),
  ];
  if (precedentes.length) {
    lignes.push('', `Également depuis le dernier email : ${precedentes.length > 1 ? 'versions' : 'version'} ${listerVersions(precedentes)} (notes complètes dans l'appli).`);
  }
  lignes.push('', `Ouvrir SéréniTV : ${SITE_URL}`, '', "Pour ne plus recevoir ces emails : bouton « Mon compte » dans l'application.");
  return lignes.join('\n');
}

async function envoyerEmails(destinataires: string[], entrees: EntreeChangelog[]) {
  const derniere = entrees[0].version;
  const sujet = `SéréniTV ${derniere} : quoi de neuf ?`;
  const html = construireEmailHtml(entrees);
  const texte = construireEmailTexte(entrees);
  const auth = btoa(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`);

  for (let i = 0; i < destinataires.length; i += MAILJET_MAX_MESSAGES) {
    const lot = destinataires.slice(i, i + MAILJET_MAX_MESSAGES);
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Un message par destinataire : personne ne voit l'adresse des autres.
        Messages: lot.map(email => ({
          From: { Email: MAILJET_SENDER_EMAIL, Name: 'SéréniTV' },
          To: [{ Email: email }],
          Subject: sujet,
          TextPart: texte,
          HTMLPart: html,
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Mailjet HTTP ${response.status} : ${await response.text()}`);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (!INTERNAL_IMPORT_SECRET || req.headers.get('x-internal-secret') !== INTERNAL_IMPORT_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY || !MAILJET_SENDER_EMAIL) {
    console.warn('[MAILJET] Secrets manquants, aucune notification envoyée.');
    return jsonResponse({ success: false, raison: 'mailjet_non_configure' });
  }

  try {
    const reponseSite = await fetch(`${SITE_URL}/changelog.json?t=${Date.now()}`);
    if (!reponseSite.ok) {
      return jsonResponse({ success: true, raison: `changelog.json indisponible (HTTP ${reponseSite.status})` });
    }
    const changelog: EntreeChangelog[] = await reponseSite.json();

    const { data: dejaAnnoncees, error: erreurAnnonces } = await supabase
      .from('notifications_mises_a_jour')
      .select('version');
    if (erreurAnnonces) throw erreurAnnonces;

    const derniereAnnoncee = (dejaAnnoncees ?? [])
      .map(r => r.version as string)
      .sort(comparerVersions)
      .pop();
    if (!derniereAnnoncee) {
      // Garde-fou : sans point de départ, on enverrait tout l'historique.
      return jsonResponse({ success: false, raison: 'aucune version de référence dans notifications_mises_a_jour' });
    }

    const nouvelles = changelog.filter(e => comparerVersions(e.version, derniereAnnoncee) > 0);
    if (nouvelles.length === 0) {
      return jsonResponse({ success: true, raison: 'rien de nouveau' });
    }

    const { data: abonnes, error: erreurAbonnes } = await supabase
      .from('profils_utilisateurs')
      .select('email')
      .eq('statut_acces', 'valide')
      .eq('notif_mises_a_jour', true);
    if (erreurAbonnes) throw erreurAbonnes;

    const destinataires = (abonnes ?? []).map(a => a.email as string).filter(Boolean);
    if (destinataires.length > 0) {
      await envoyerEmails(destinataires, nouvelles);
    }

    const { error: erreurInsertion } = await supabase
      .from('notifications_mises_a_jour')
      .insert(nouvelles.map(e => ({ version: e.version, nb_destinataires: destinataires.length })));
    if (erreurInsertion) throw erreurInsertion;

    console.log(`[NOTIF MAJ] ${nouvelles.map(e => e.version).join(', ')} annoncée(s) à ${destinataires.length} abonné(s).`);
    return jsonResponse({ success: true, versions: nouvelles.map(e => e.version), destinataires: destinataires.length });
  } catch (err) {
    console.error('[NOTIF MAJ] Erreur:', err.message ?? err);
    return jsonResponse({ error: err.message ?? String(err) }, 500);
  }
});
