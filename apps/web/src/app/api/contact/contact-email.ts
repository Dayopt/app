import 'server-only';

import { dayoptContact, dayoptContactDeliverySources } from '@dayopt/config';
import { z } from 'zod';

import { env } from '@/platform/config/env';

const categoryLabels = {
  bug: 'Bug',
  feature: 'Feature',
  question: 'Question',
  other: 'Other',
} as const;
const CONTACT_EMAIL_TIMEOUT_MS = 10_000;
const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

const emailAddressSchema = z
  .string()
  .trim()
  .max(254)
  .email()
  .refine((value) => !/[\r\n,]/u.test(value));
const senderEmailSchema = emailAddressSchema.refine((value) =>
  value.toLowerCase().endsWith('@dayopt.app'),
);
const resendSuccessSchema = z.object({ id: z.string().min(1) });

export type WebContactEmailInput = {
  submissionId: string;
  name: string;
  email: string;
  category: keyof typeof categoryLabels;
  message: string;
};

function getEmailConfiguration(): { apiKey: string; from: string } {
  if (env.VERCEL_ENV !== 'production') {
    throw new Error('Contact email delivery is available only in Production');
  }

  const apiKey = env.RESEND_API_KEY?.trim();
  const fromResult = senderEmailSchema.safeParse(env.RESEND_FROM_EMAIL);

  if (!apiKey || !fromResult.success || fromResult.data === 'onboarding@resend.dev') {
    throw new Error('Contact email configuration is missing or invalid');
  }

  return { apiKey, from: fromResult.data };
}

/** Deliver one validated Website contact submission to the monitored support inbox. */
export async function sendContactEmail(input: WebContactEmailInput): Promise<void> {
  const { apiKey, from } = getEmailConfiguration();
  const replyToResult = emailAddressSchema.safeParse(input.email);
  if (!replyToResult.success) throw new Error('Contact email reply address is invalid');

  const categoryLabel = categoryLabels[input.category];
  const text = [
    'Unverified submission from the Dayopt Website contact form.',
    '',
    `Category: ${categoryLabel}`,
    `Name: ${input.name}`,
    `Email: ${replyToResult.data}`,
    '',
    'Message:',
    input.message,
  ].join('\n');

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), CONTACT_EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `contact-web-${input.submissionId}`,
      },
      body: JSON.stringify({
        from: `Dayopt Contact <${from}>`,
        to: [dayoptContact.supportEmail],
        reply_to: replyToResult.data,
        subject: `[Dayopt Contact][Web][${categoryLabel}]`,
        text,
        tags: [
          { name: 'source', value: dayoptContactDeliverySources.web },
          { name: 'category', value: input.category },
        ],
      }),
      signal: abortController.signal,
    });

    if (abortController.signal.aborted) throw new Error('Contact email delivery timed out');
    if (!response.ok) throw new Error('Contact email provider returned an unsuccessful response');

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch (error) {
      if (abortController.signal.aborted) throw error;
      responseBody = null;
    }

    if (abortController.signal.aborted) throw new Error('Contact email delivery timed out');
    if (!resendSuccessSchema.safeParse(responseBody).success) {
      throw new Error('Contact email provider returned an unsuccessful response');
    }
  } catch (error) {
    if (abortController.signal.aborted) throw new Error('Contact email delivery timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
