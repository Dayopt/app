import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConflictOverlay } from './ConflictOverlay';

describe('ConflictOverlay', () => {
  it('previewTimeを12時間表記で表示する', () => {
    render(
      <ConflictOverlay
        message="overlap"
        previewTime={{
          start: new Date(2026, 6, 15, 13, 5),
          end: new Date(2026, 6, 15, 14, 30),
        }}
        timeFormat="12h"
      />,
    );

    expect(screen.getByText('1:05 PM – 2:30 PM')).toBeInTheDocument();
  });
});
