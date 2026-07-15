import { createElement, type KeyboardEventHandler } from 'react';
import { createPortal } from 'react-dom';

import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useScrollableCalendar } from '../useScrollableCalendar';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function PortalFixture({ onKeyDown }: { onKeyDown: KeyboardEventHandler<HTMLDivElement> }) {
  return createElement(
    'div',
    { onKeyDown },
    createPortal(
      createElement(
        'div',
        { role: 'dialog' },
        createElement('button', { type: 'button' }, 'Dialog action'),
      ),
      document.body,
    ),
  );
}

describe('useScrollableCalendar keyboard navigation', () => {
  it('focused gridだけをPageDown 1回分スクロールし、外部keydownを無視する', () => {
    const { result } = renderHook(() =>
      useScrollableCalendar({
        viewMode: 'week',
        hourHeight: 60,
      }),
    );

    const scrollContainer = document.createElement('div');
    const grid = document.createElement('div');
    const externalInput = document.createElement('input');
    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 300,
    });
    scrollContainer.scrollTop = 120;
    grid.tabIndex = 0;
    scrollContainer.append(grid);
    document.body.append(scrollContainer, externalInput);
    result.current.scrollContainerRef.current = scrollContainer;
    grid.addEventListener('keydown', result.current.handleKeyDown);

    grid.focus();
    expect(document.activeElement).toBe(grid);
    fireEvent.keyDown(grid, { key: 'PageDown' });
    expect(scrollContainer.scrollTop).toBe(420);

    externalInput.focus();
    expect(document.activeElement).toBe(externalInput);
    fireEvent.keyDown(externalInput, { key: 'PageDown' });
    fireEvent.keyDown(document, { key: 'PageDown' });
    expect(scrollContainer.scrollTop).toBe(420);
  });

  it('Calendar配下のReact Portal内keydownをscroll操作として扱わない', () => {
    const { result } = renderHook(() =>
      useScrollableCalendar({
        viewMode: 'week',
        hourHeight: 60,
      }),
    );
    const scrollContainer = document.createElement('div');
    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 300,
    });
    scrollContainer.scrollTop = 120;
    document.body.append(scrollContainer);
    result.current.scrollContainerRef.current = scrollContainer;

    render(createElement(PortalFixture, { onKeyDown: result.current.handleKeyDown }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Dialog action' }), { key: 'PageDown' });

    expect(scrollContainer.scrollTop).toBe(120);
  });
});
