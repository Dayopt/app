import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DockedInspectorPanel } from '../DockedInspectorPanel';

function makeSlot() {
  const slot = document.createElement('div');
  document.body.appendChild(slot);
  return slot;
}

describe('DockedInspectorPanel', () => {
  it('renders nothing when no slot element is registered yet', () => {
    const { container } = render(
      <DockedInspectorPanel title="Work" slotElement={null}>
        <button type="button">Edit</button>
      </DockedInspectorPanel>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('portals its content into the slot element and exposes a non-modal region', () => {
    const slot = makeSlot();

    render(
      <DockedInspectorPanel title="Work" slotElement={slot}>
        <button type="button">Edit</button>
      </DockedInspectorPanel>,
    );

    const region = screen.getByRole('region', { name: 'Work' });
    expect(slot.contains(region)).toBe(true);
    expect(region).not.toHaveAttribute('aria-modal');
  });

  it('moves focus into the panel on open and restores it to the previously focused element on close', async () => {
    const slot = makeSlot();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <DockedInspectorPanel title="Work" slotElement={slot}>
        <button type="button">Edit</button>
      </DockedInspectorPanel>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus());

    unmount();

    expect(document.activeElement).toBe(trigger);
  });
});
