/**
 * Supabase Edge Function: Custom Auth Emails with Resend + React Email
 *
 * Supabase Auth Hook (send_email) 経由で呼び出され、
 * React Email テンプレートを renderAsync でHTML化し、Resend で送信。
 *
 * @see https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend
 */

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import React from 'npm:react@18.3.1';
import { Resend } from 'npm:resend@4.0.0';

import { ConfirmEmail } from './ConfirmEmail.tsx';
import { MagicLinkEmail } from './MagicLinkEmail.tsx';
import { PasswordResetEmail } from './PasswordResetEmail.tsx';

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);
const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string).replace('v1,whsec_', '');
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'auth@send.dayopt.app';
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://dayopt.app';

interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new: string;
  token_hash_new: string;
}

interface WebhookPayload {
  user: {
    email: string;
    user_metadata: {
      full_name?: string;
    };
  };
  email_data: EmailData;
}

/**
 * Auth メールタイプに応じた確認URLを構築
 */
function buildConfirmUrl(emailData: EmailData): string {
  const { token_hash, redirect_to, email_action_type } = emailData;
  const baseUrl = redirect_to || APP_URL;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token_hash=${token_hash}&type=${email_action_type}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('not allowed', { status: 400 });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(hookSecret);

  try {
    const { user, email_data } = wh.verify(payload, headers) as WebhookPayload;

    const userName = user.user_metadata.full_name || 'there';
    const confirmUrl = buildConfirmUrl(email_data);

    let subject: string;
    let element: React.ReactElement;

    switch (email_data.email_action_type) {
      case 'signup': {
        subject = 'Confirm your Dayopt email';
        element = React.createElement(ConfirmEmail, {
          userName,
          confirmUrl,
          appUrl: APP_URL,
        });
        break;
      }
      case 'recovery': {
        subject = 'Reset your Dayopt password';
        element = React.createElement(PasswordResetEmail, {
          userName,
          resetUrl: confirmUrl,
          appUrl: APP_URL,
        });
        break;
      }
      case 'magic_link': {
        subject = 'Log in to Dayopt';
        element = React.createElement(MagicLinkEmail, {
          loginUrl: confirmUrl,
          appUrl: APP_URL,
        });
        break;
      }
      default: {
        return new Response(
          JSON.stringify({
            error: {
              message: `Unknown email action type: ${email_data.email_action_type}`,
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    const html = await renderAsync(element);

    const { error } = await resend.emails.send({
      from: `Dayopt <${FROM_EMAIL}>`,
      to: [user.email],
      subject,
      html,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: {
          http_code: error.code,
          message: error.message,
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
