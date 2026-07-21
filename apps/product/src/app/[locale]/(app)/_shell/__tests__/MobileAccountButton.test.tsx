import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MobileAccountButton } from '../MobileAccountButton';

describe('MobileAccountButton', () => {
  it('links to settings with an accessible account label', () => {
    render(
      <MobileAccountButton
        href="/ja/settings"
        displayName="Tester"
        ariaLabel="アカウント"
        avatarUrl={null}
      />,
    );

    const link = screen.getByRole('link', { name: 'アカウント' });
    expect(link).toHaveAttribute('href', '/ja/settings');
    expect(screen.getByText('T')).toBeInTheDocument();
  });
});
