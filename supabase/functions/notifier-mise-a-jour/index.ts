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

function construireEmailHtml(entrees: EntreeChangelog[]): string {
  const versionsHtml = entrees.map(e => `
          <tr>
            <td style="padding:12px 0 4px; color:#E8EAF6; font-size:15px; font-weight:700;">Version ${echapperHtml(e.version)} <span style="color:#9297b3; font-weight:400; font-size:13px;">· ${echapperHtml(e.date)}</span></td>
          </tr>
          <tr>
            <td style="color:#9297b3; font-size:14px; line-height:1.6;">
              <ul style="margin:0; padding-left:20px;">${e.changes.map(c => `<li style="margin-bottom:6px;">${echapperHtml(c)}</li>`).join('')}</ul>
            </td>
          </tr>`).join('');

  return `
<div style="background-color:#13151F; padding:40px 20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background-color:#1A1D2E; border:1px solid #2A2D40; border-radius:8px;">
    <tr>
      <td style="padding:32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center; padding-bottom:20px;">
              <span style="color:#E8EAF6; font-size:18px; font-weight:700;">✦ SéréniTV</span>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; padding-bottom:8px;">
              <h1 style="color:#E8EAF6; font-size:20px; font-weight:800; margin:0;">Quoi de neuf sur SéréniTV ?</h1>
            </td>
          </tr>${versionsHtml}
          <tr>
            <td style="text-align:center; padding-top:24px;">
              <a href="${SITE_URL}" style="display:inline-block; background-color:#5B7CF8; color:#ffffff; text-decoration:none; font-weight:600; font-size:15px; padding:12px 28px; border-radius:8px;">Ouvrir SéréniTV</a>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; padding-top:24px; color:#6b6f8a; font-size:12px; line-height:1.5;">
              Vous recevez cet email car vous êtes abonné aux nouveautés de SéréniTV.<br>
              Pour ne plus les recevoir : bouton 👤 « Mon compte » dans l'application.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

function construireEmailTexte(entrees: EntreeChangelog[]): string {
  return 'Quoi de neuf sur SéréniTV ?\n\n' +
    entrees.map(e => `Version ${e.version} (${e.date})\n` + e.changes.map(c => `- ${c}`).join('\n')).join('\n\n') +
    `\n\nOuvrir SéréniTV : ${SITE_URL}\n\nPour ne plus recevoir ces emails : bouton « Mon compte » dans l'application.`;
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
