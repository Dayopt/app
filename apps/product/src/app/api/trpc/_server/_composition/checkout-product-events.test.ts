import { describe, expect, it } from 'vitest';

import { countSuccessfulCheckoutStarts } from './checkout-product-events';

describe('countSuccessfulCheckoutStarts', () => {
  it('counts an exact successful checkout response', () => {
    expect(
      countSuccessfulCheckoutStarts({
        data: [{ result: { data: { url: 'https://checkout.test' } } }],
        eagerGeneration: false,
        paths: ['billing.createCheckoutSession'],
      }),
    ).toBe(1);
  });

  it('does not count an exact checkout error', () => {
    expect(
      countSuccessfulCheckoutStarts({
        data: [{ error: { code: 'INTERNAL_SERVER_ERROR' } }],
        eagerGeneration: false,
        paths: ['billing.createCheckoutSession'],
      }),
    ).toBe(0);
  });

  it('uses path/response index mapping in a mixed batch', () => {
    expect(
      countSuccessfulCheckoutStarts({
        data: [
          { error: { code: 'BAD_REQUEST' } },
          { result: { data: { url: 'https://checkout.test' } } },
          { result: { data: { id: 'tag-1' } } },
        ],
        eagerGeneration: false,
        paths: ['tags.create', 'billing.createCheckoutSession', 'billing.createPortalSession'],
      }),
    ).toBe(1);
  });

  it('does not count a success at another batch index', () => {
    expect(
      countSuccessfulCheckoutStarts({
        data: [{ error: { code: 'BAD_REQUEST' } }, { result: { data: { url: 'x' } } }],
        eagerGeneration: false,
        paths: ['billing.createCheckoutSession', 'tags.create'],
      }),
    ).toBe(0);
  });

  it('does not count eager response metadata generation', () => {
    expect(
      countSuccessfulCheckoutStarts({
        data: [],
        eagerGeneration: true,
        paths: ['billing.createCheckoutSession'],
      }),
    ).toBe(0);
  });
});
