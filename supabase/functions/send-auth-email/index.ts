/**
 * Supabase Edge Function: Custom Auth Emails with Resend + React Email
 *
 * Supabase Auth Hook (send_email) 経由で呼び出され、
 * React Email テンプレートを renderAsync でHTML化し、Resend で送信。
 *
 * @see https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend
 */

import { renderAsync } from '@react-email/components';
import React from 'react';
import { Resend } from 'resend';
import { Webhook } from 'standardwebhooks';

import type { EmailData, WebhookPayload } from '../_shared/types.ts';

import { ConfirmEmail } from './ConfirmEmail.tsx';
import { MagicLinkEmail } from './MagicLinkEmail.tsx';
import { PasswordResetEmail } from './PasswordResetEmail.tsx';

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);
const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string).replace('v1,whsec_', '');
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'auth@send.dayopt.app';
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://dayopt.app';

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
