import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ['https://sereni-tv.vercel.app'];

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const OWNER_ID = 'e062f101-98f4-4d4f-818f-134add366f28';

const MAILJET_API_KEY = Deno.env.get('MAILJET_API_KEY');
const MAILJET_SECRET_KEY = Deno.env.get('MAILJET_SECRET_KEY');
const MAILJET_SENDER_EMAIL = Deno.env.get('MAILJET_SENDER_EMAIL');

const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function jsonResponse(corsHeaders: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SITE_URL = 'https://sereni-tv.vercel.app';

/**
 * Gabarit HTML des emails, repris de la charte du portail (fond #13151F,
 * carte #1A1D2E, accent #5B7CF8). Mise en page par tableau pour rester
 * lisible dans les clients mail qui ignorent flexbox/grid.
 */
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

/**
 * Envoie l'email de décision (validation/refus) via Mailjet. N'échoue jamais
 * la requête appelante : une erreur d'envoi est seulement loggée, la décision
 * d'accès elle-même reste appliquée.
 */
async function envoyerEmailDecision(destinataire: string, approuve: boolean) {
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY || !MAILJET_SENDER_EMAIL) {
    console.warn('[MAILJET] Secrets manquants, email non envoyé.');
    return;
  }

  const subject = approuve
    ? 'Ton accès à SéréniTV est validé !'
    : "Ta demande d'accès à SéréniTV";
  const texteCorps = approuve
    ? "Bonne nouvelle : ta demande d'accès à la bêta privée de SéréniTV a été validée. Tu peux dès maintenant te connecter avec l'email et le mot de passe choisis à l'inscription."
    : "Ta demande d'accès à la bêta privée de SéréniTV n'a pas été retenue pour le moment.";
  const textPart = texteCorps;
  const htmlPart = construireEmailHtml(
    subject,
    texteCorps,
    approuve ? { texte: 'Se connecter', url: SITE_URL } : undefined
  );

  try {
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
            To: [{ Email: destinataire }],
            Subject: subject,
            TextPart: textPart,
            HTMLPart: htmlPart,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[MAILJET] Échec envoi email:', await response.text());
    }
  } catch (err) {
    console.error('[MAILJET] Erreur envoi email:', err.message);
  }
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId || userId !== OWNER_ID) {
    return jsonResponse(corsHeaders, { error: 'unauthorized' }, 401);
  }

  try {
    const body = await req.json();
    const { action, targetUserId } = body;
    if (!targetUserId) {
      return jsonResponse(corsHeaders, { error: 'targetUserId manquant' }, 400);
    }

    if (action === 'approve' || action === 'reject') {
      const statut = action === 'approve' ? 'valide' : 'refuse';
      const { data: updated, error } = await supabase
        .from('profils_utilisateurs')
        .update({
          statut_acces: statut,
          valide_at: action === 'approve' ? new Date().toISOString() : null,
        })
        .eq('id', targetUserId)
        .select('email')
        .single();
      if (error) throw error;

      if (updated?.email) {
        await envoyerEmailDecision(updated.email, action === 'approve');
      }

      return jsonResponse(corsHeaders, { success: true });
    }

    return jsonResponse(corsHeaders, { error: 'action inconnue' }, 400);
  } catch (err) {
    return jsonResponse(corsHeaders, { error: err.message }, 500);
  }
});
