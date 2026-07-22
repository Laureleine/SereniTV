import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Appelée uniquement par le trigger Postgres creer_profil_utilisateur() lors
// d'une nouvelle inscription (jamais par un navigateur) : gardée par un
// secret interne serveur-à-serveur, jamais exposé au client.
const INTERNAL_NOTIFY_SECRET = Deno.env.get('INTERNAL_NOTIFY_SECRET');

const MAILJET_API_KEY = Deno.env.get('MAILJET_API_KEY');
const MAILJET_SECRET_KEY = Deno.env.get('MAILJET_SECRET_KEY');
const MAILJET_SENDER_EMAIL = Deno.env.get('MAILJET_SENDER_EMAIL');
const OWNER_EMAIL = 'azghal@free.fr';
const SITE_URL = 'https://sereni-tv.vercel.app';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function construireEmailHtml(titre: string, corps: string, bouton?: { texte: string; url: string }): string {
  const boutonHtml = bouton ? `
        <tr>
          <td style="text-align:center; padding-top:8px;">
            <a href="${bouton.url}" style="display:inline-block; background-color:#5B7CF8; color:#ffffff; text-decoration:none; font-weight:600; font-size:15px; padding:12px 28px; border-radius:8px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${bouton.texte}</a>
          </td>
        </tr>` : '';

  return `
<div style="background-color:#13151F; padding:40px 20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto; background-color:#1A1D2E; border:1px solid #2A2D40; border-radius:8px;">
    <tr>
      <td style="padding:32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center; padding-bottom:20px;">
              <span style="color:#E8EAF6; font-size:18px; font-weight:700;">✦ SéréniTV</span>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; padding-bottom:16px;">
              <h1 style="color:#E8EAF6; font-size:20px; font-weight:800; margin:0;">${titre}</h1>
            </td>
          </tr>
          <tr>
            <td style="text-align:center; padding-bottom:8px;">
              <p style="color:#9297b3; font-size:15px; line-height:1.6; margin:0;">${corps}</p>
            </td>
          </tr>${boutonHtml}
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-internal-secret') !== INTERNAL_NOTIFY_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY || !MAILJET_SENDER_EMAIL) {
    console.warn('[MAILJET] Secrets manquants, notification non envoyée.');
    return jsonResponse({ success: false });
  }

  try {
    const { email, motivation } = await req.json();

    const corps = `${email} vient de demander l'accès à la bêta privée de SéréniTV.` +
      (motivation ? ` Motivation : « ${motivation} »` : '');
    const htmlPart = construireEmailHtml('Nouvelle inscription à valider', corps, {
      texte: "Ouvrir l'admin",
      url: SITE_URL,
    });

    const auth = btoa(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`);
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: MAILJET_SENDER_EMAIL, Name: 'SéréniTV' },
            To: [{ Email: OWNER_EMAIL }],
            Subject: 'Nouvelle inscription à valider — SéréniTV',
            TextPart: corps,
            HTMLPart: htmlPart,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[MAILJET] Échec envoi notification:', await response.text());
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('[NOTIFY] Erreur:', err.message);
    return jsonResponse({ error: err.message }, 500);
  }
});
