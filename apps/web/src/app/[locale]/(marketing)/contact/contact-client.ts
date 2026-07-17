import { captureUnexpectedWebError } from '@/platform/observability/capture-unexpected-error';

interface ContactSubmissionPayload {
  name: string;
  email: string;
  category: string;
  message: string;
  website?: string;
  turnstileToken: string | null;
}

class ContactResponseError extends Error {
  constructor() {
    super('Contact API rejected the request');
    this.name = 'ContactResponseError';
  }
}

/** HTTP responses are observed by the server boundary; only browser transport failures are captured. */
export async function submitContactRequest(payload: ContactSubmissionPayload): Promise<void> {
  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new ContactResponseError();
  } catch (error) {
    if (error instanceof ContactResponseError) throw error;
    throw captureUnexpectedWebError(error, {
      feature: 'contact',
      operation: 'submit_contact_form',
      route: '/api/contact',
      source: 'browser_transport',
    });
  }
}
