import { dayoptContact, dayoptContactDeliverySources } from '@dayopt/config';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

import { env } from '@/platform/config/env';
import { captureUnexpectedWebError } from '@/platform/observability/capture-unexpected-error';
import {
  claimResendWebhookEvent,
  completeResendWebhookEvent,
  releaseResendWebhookEvent,
} from '@/platform/security/resend-webhook-dedup';

export const maxDuration = 15;
export const runtime = 'nodejs';

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

class WebhookBodyTooLargeError extends Error {}

type EmailEventData = {
  email_id: string;
  to: string[];
  tags?: Record<string, string>;
};

function isEmailEventData(data: unknown): data is EmailEventData {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<EmailEventData>;
  return (
    typeof candidate.email_id === 'string' &&
    Array.isArray(candidate.to) &&
    candidate.to.every((address) => typeof address === 'string')
  );
}

async function readWebhookBody(request: NextRequest): Promise<string> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declaredBytes = Number.parseInt(contentLength, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_WEBHOOK_BODY_BYTES) {
      throw new WebhookBodyTooLargeError();
    }
  }

  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let payload = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new WebhookBodyTooLargeError();
      }
      payload += decoder.decode(value, { stream: true });
    }
    return payload + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function isWebContactDelivery(data: EmailEventData): boolean {
  return (
    data.to.some((address) => address.toLowerCase() === dayoptContact.supportEmail) &&
    data.tags?.source === dayoptContactDeliverySources.web
  );
}

function captureWebContactDeliveryFailure(eventType: string, data: EmailEventData): void {
  captureUnexpectedWebError(new Error(`Web contact email delivery failed: ${eventType}`), {
    feature: 'contact',
    operation: 'email_delivery_status',
    route: '/api/webhooks/resend',
    source: 'resend_webhook',
    requestId: data.email_id,
  });
}

export async function POST(request: NextRequest) {
  const webhookSecret = env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    captureUnexpectedWebError(new Error('Web Resend webhook secret is not configured'), {
      feature: 'contact',
      operation: 'resend_webhook_configuration',
      route: '/api/webhooks/resend',
      source: 'resend_webhook',
    });
    return NextResponse.json({ error: 'Webhook unavailable' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
  }

  let payload: string;
  try {
    payload = await readWebhookBody(request);
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    captureUnexpectedWebError(error, {
      feature: 'contact',
      operation: 'read_resend_webhook',
      route: '/api/webhooks/resend',
      source: 'resend_webhook',
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  let event: ReturnType<Resend['webhooks']['verify']>;
  try {
    event = new Resend().webhooks.verify({
      payload,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const isFailureType =
    event.type === 'email.bounced' ||
    event.type === 'email.complained' ||
    event.type === 'email.failed' ||
    event.type === 'email.suppressed';
  const eventData = isEmailEventData(event.data) ? event.data : undefined;

  if (!isFailureType || !eventData || !isWebContactDelivery(eventData)) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let claim: Awaited<ReturnType<typeof claimResendWebhookEvent>>;
  try {
    claim = await claimResendWebhookEvent(svixId);
    if (claim.status === 'already_processed') {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    if (claim.status === 'in_progress') {
      return NextResponse.json({ error: 'Webhook processing in progress' }, { status: 503 });
    }
  } catch (error) {
    captureUnexpectedWebError(error, {
      feature: 'contact',
      operation: 'dedupe_resend_webhook',
      route: '/api/webhooks/resend',
      source: 'upstash',
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  try {
    captureWebContactDeliveryFailure(event.type, eventData);
    await completeResendWebhookEvent(svixId, claim.token);
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    try {
      await releaseResendWebhookEvent(svixId, claim.token);
    } catch (releaseError) {
      captureUnexpectedWebError(releaseError, {
        feature: 'contact',
        operation: 'release_resend_webhook',
        route: '/api/webhooks/resend',
        source: 'upstash',
      });
    }
    captureUnexpectedWebError(error, {
      feature: 'contact',
      operation: 'process_resend_webhook',
      route: '/api/webhooks/resend',
      source: 'resend_webhook',
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
