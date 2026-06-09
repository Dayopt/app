import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CalendarEvent } from '../../types/calendar-event';

import { EntryCard } from './EntryCard';

describe('EntryCard', () => {
  const mockEvent: CalendarEvent = {
    id: 'event-1',
    title: 'テストイベント',
    description: 'テスト説明',
    startDate: new Date('2025-01-15T10:00:00'),
    endDate: new Date('2025-01-15T11:00:00'),
    status: 'open',
    color: 'blue',
    tagId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    displayStartDate: new Date('2025-01-15T10:00:00'),
    displayEndDate: new Date('2025-01-15T11:00:00'),
    duration: 60,
    isMultiDay: false,
  };

  const mockPosition = {
    top: 100,
    left: 10,
    width: 80,
    height: 60,
  };

  describe('基本レンダリング', () => {
    it('イベントが正しく表示される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} />);

      expect(screen.getByLabelText(/entry: テストイベント/i)).toBeInTheDocument();
    });

    it('デフォルトポジションが適用される', () => {
      render(<EntryCard entry={mockEvent} position={undefined} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock).toBeInTheDocument();
    });

    it('aria属性が正しく設定される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock).toHaveAttribute('aria-label', 'entry: テストイベント');
      expect(eventBlock).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('planned / actual レイヤー表示', () => {
    it('planned entry は planned 背景と actual カードを重ねて表示する', () => {
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: mockEvent.startDate,
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
        />,
      );

      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');
      const contentLayer = container.querySelector<HTMLElement>('[data-entry-content-layer]');

      expect(screen.getByLabelText(/entry: テストイベント/i)).toHaveStyle({
        left: '10%',
        width: 'calc(80% - 8px)',
      });
      expect(plannedLayer).toBeInTheDocument();
      expect(actualLayer).toBeInTheDocument();
      expect(contentLayer).toBeInTheDocument();
      expect(plannedLayer).toHaveClass('rounded-r-lg');
      expect(plannedLayer).not.toHaveClass('pattern-hatch');
      expect(plannedLayer?.style.border).toBe('');
      expect(plannedLayer).toHaveStyle({ left: '-1px' });
      expect(actualLayer).toHaveStyle({ top: '0px', height: '60px' });
      expect(contentLayer).toHaveStyle({ top: '0px', height: '60px' });
    });

    it('upcoming planned entry は actual があっても予定UIとして表示する', () => {
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            entryState: 'upcoming',
            actualStartDate: new Date('2025-01-15T10:15:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
          hourHeight={60}
        />,
      );

      const root = screen.getByLabelText(/entry: テストイベント/i);
      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const contentLayer = container.querySelector<HTMLElement>('[data-entry-content-layer]');

      expect(root).toHaveStyle({
        top: '100px',
        left: 'calc(10% - 1px)',
        width: 'calc(80% - 7px)',
        height: '60px',
      });
      expect(plannedLayer).toHaveClass('rounded-r-lg');
      expect(plannedLayer).toHaveStyle({ top: '0px', left: '0px', height: '60px' });
      expect(contentLayer).toHaveStyle({ top: '0px', height: '60px' });
      expect(container.querySelector('[data-entry-actual-layer]')).not.toBeInTheDocument();
      expect(container.querySelector('[data-entry-actual-accent]')).not.toBeInTheDocument();
    });

    it('upcoming planned entry はグリッドdurationの高さに揃える', () => {
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            entryState: 'upcoming',
            actualStartDate: new Date('2025-01-15T10:15:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={{ ...mockPosition, height: 58 }}
          hourHeight={60}
        />,
      );

      const root = screen.getByLabelText(/entry: テストイベント/i);
      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const contentLayer = container.querySelector<HTMLElement>('[data-entry-content-layer]');
      const resizeFrame = container.querySelector<HTMLElement>('[data-entry-resize-frame]');

      expect(root).toHaveStyle({ height: '60px' });
      expect(plannedLayer).toHaveStyle({ height: '60px' });
      expect(contentLayer).toHaveStyle({ height: '60px' });
      expect(resizeFrame).toHaveStyle({ height: '60px' });
    });

    it('actual が planned より短い場合は planned 背景が露出する', () => {
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: new Date('2025-01-15T10:15:00'),
            actualEndDate: new Date('2025-01-15T10:45:00'),
          }}
          position={mockPosition}
          hourHeight={60}
        />,
      );

      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');

      expect(plannedLayer).toHaveStyle({ top: '0px', left: '-1px', height: '60px' });
      expect(actualLayer).toHaveStyle({ top: '15px', height: '30px' });
      expect(container.querySelector('.pattern-hatch')).not.toBeInTheDocument();
    });

    it('actual 開始が遅れた前半 gap から予定外記録の作成範囲を返す', () => {
      const onGapClick = vi.fn();
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: new Date('2025-01-15T10:30:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
          hourHeight={60}
          onGapClick={onGapClick}
        />,
      );

      const topGap = container.querySelector<HTMLElement>('[data-entry-gap="top"]');
      const gapAction = topGap?.querySelector<HTMLElement>('[data-entry-gap-action]');

      expect(topGap).toHaveAttribute('role', 'button');
      expect(topGap).toHaveStyle({ top: '0px', height: '30px' });
      expect(gapAction).toBeInTheDocument();
      expect(gapAction).toHaveStyle({ right: 'calc(25% - 10px)' });
      expect(container.querySelector<HTMLElement>('[data-entry-content-layer]')).toHaveStyle({
        right: '50%',
      });

      fireEvent.click(topGap!);

      expect(onGapClick).toHaveBeenCalledTimes(1);
      expect(onGapClick).toHaveBeenCalledWith(600, 630);
    });

    it('既に別の記録で埋まっている前半 gap は作成導線を隠す', () => {
      const onGapClick = vi.fn();
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: new Date('2025-01-15T10:30:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
          hourHeight={60}
          onGapClick={onGapClick}
          isGapAvailable={() => false}
        />,
      );

      const topGap = container.querySelector<HTMLElement>('[data-entry-gap="top"]');

      expect(topGap).toHaveAttribute('aria-hidden', 'true');
      expect(topGap).not.toHaveAttribute('role');
      expect(container.querySelector('[data-entry-gap-action]')).not.toBeInTheDocument();
      expect(container.querySelector<HTMLElement>('[data-entry-content-layer]')).toHaveStyle({
        right: '0px',
      });

      fireEvent.click(topGap!);

      expect(onGapClick).not.toHaveBeenCalled();
    });

    it('未来に終わる前半 gap は作成導線を無効にする', () => {
      const onGapClick = vi.fn();
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            startDate: new Date('2030-01-15T10:00:00'),
            endDate: new Date('2030-01-15T11:00:00'),
            origin: 'planned',
            actualStartDate: new Date('2030-01-15T10:30:00'),
            actualEndDate: new Date('2030-01-15T11:00:00'),
          }}
          position={mockPosition}
          hourHeight={60}
          onGapClick={onGapClick}
          gapCreationCutoffMs={new Date('2026-01-15T00:00:00').getTime()}
        />,
      );

      const topGap = container.querySelector<HTMLElement>('[data-entry-gap="top"]');

      expect(topGap).toHaveAttribute('aria-hidden', 'true');
      expect(topGap).not.toHaveAttribute('role');

      fireEvent.click(topGap!);

      expect(onGapClick).not.toHaveBeenCalled();
    });

    it('actual が planned 内でズレた場合は planned 背景と actual card が別レイヤーで見える', () => {
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            endDate: new Date('2025-01-15T12:00:00'),
            displayEndDate: new Date('2025-01-15T12:00:00'),
            duration: 120,
            actualStartDate: new Date('2025-01-15T10:30:00'),
            actualEndDate: new Date('2025-01-15T11:30:00'),
          }}
          position={{ ...mockPosition, height: 120 }}
          hourHeight={60}
        />,
      );

      const root = screen.getByLabelText(/entry: テストイベント/i);
      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');
      const contentLayer = container.querySelector<HTMLElement>('[data-entry-content-layer]');

      expect(root).toHaveStyle({ top: '100px', height: '120px' });
      expect(plannedLayer).toHaveStyle({ top: '0px', left: '-1px', height: '120px' });
      expect(actualLayer).toHaveStyle({ top: '30px', height: '60px' });
      expect(contentLayer).toHaveStyle({ top: '0px', height: '120px' });
    });

    it('actual が planned を超過した場合は従来の破線オーバーレイを維持する', () => {
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: new Date('2025-01-15T09:30:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
          hourHeight={60}
        />,
      );

      const root = screen.getByLabelText(/entry: テストイベント/i);
      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');
      const actualBody = container.querySelector<HTMLElement>('[data-entry-actual-body]');
      const overtimeAccent = container.querySelector<HTMLElement>('[data-entry-overtime-accent]');

      expect(root).toHaveStyle({ top: '70px', height: '90px' });
      expect(plannedLayer).toHaveStyle({ top: '30px', left: '-1px', height: '60px' });
      expect(actualLayer).toHaveStyle({ top: '30px', height: '60px' });
      expect(actualBody).toHaveStyle({ borderRadius: '0 0 8px 0' });
      expect(overtimeAccent).toBeInTheDocument();
      expect(overtimeAccent).toHaveClass('left-0');
      expect(overtimeAccent).toHaveStyle({ width: '3px' });
      const overtimeFrame = overtimeAccent?.parentElement?.lastElementChild as HTMLElement | null;
      expect(overtimeFrame).toHaveStyle({ borderRadius: '0 8px 0 0' });
      expect(overtimeFrame?.style.borderTopStyle).toBe('dashed');
      expect(overtimeFrame?.style.borderRightStyle).toBe('dashed');
      expect(overtimeFrame?.style.borderBottomStyle).toBe('dashed');
      expect(overtimeFrame?.style.borderLeftStyle).toBe('');
    });

    it('unplanned entry は planned 背景を描かず点線の actual のみ表示する', () => {
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'unplanned',
            actualStartDate: mockEvent.startDate,
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
        />,
      );

      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');
      const actualAccent = container.querySelector<HTMLElement>('[data-entry-actual-accent]');
      const actualBody = container.querySelector<HTMLElement>('[data-entry-actual-body]');

      expect(screen.getByLabelText(/entry: テストイベント/i)).toHaveStyle({
        left: '10%',
        width: 'calc(80% - 8px)',
      });
      expect(container.querySelector('[data-entry-planned-layer]')).not.toBeInTheDocument();
      expect(container.querySelector('[data-entry-content-layer]')).not.toBeInTheDocument();
      expect(actualLayer).toBeInTheDocument();
      expect(actualAccent).toBeInTheDocument();
      expect(actualBody?.style.borderTopStyle).toBe('dashed');
      expect(actualBody?.style.borderRightStyle).toBe('dashed');
      expect(actualBody?.style.borderBottomStyle).toBe('dashed');
      expect(actualBody?.style.borderLeftStyle).toBe('');
    });

    it('active entry は左アクセントに現在中の明滅クラスを付ける', () => {
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            entryState: 'active',
            actualStartDate: mockEvent.startDate,
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
        />,
      );

      const actualAccent = container.querySelector<HTMLElement>('[data-entry-actual-accent]');

      expect(actualAccent).toHaveClass('entry-live-accent');
    });

    it('active ではない entry は左アクセントを明滅させない', () => {
      const { container } = render(
        <EntryCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            entryState: 'past',
            actualStartDate: mockEvent.startDate,
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
        />,
      );

      const actualAccent = container.querySelector<HTMLElement>('[data-entry-actual-accent]');

      expect(actualAccent).not.toHaveClass('entry-live-accent');
    });
  });

  describe('インタラクション', () => {
    it('クリックイベントが発火する', () => {
      const onClick = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onClick={onClick} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.click(eventBlock);

      expect(onClick).toHaveBeenCalledWith(mockEvent);
    });

    it('右クリックでコンテキストメニューが表示される', () => {
      const onContextMenu = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onContextMenu={onContextMenu} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.contextMenu(eventBlock);

      expect(onContextMenu).toHaveBeenCalledWith(mockEvent, expect.any(Object));
    });

    it('キーボード操作でクリックイベントが発火する（Enter）', () => {
      const onClick = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onClick={onClick} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.keyDown(eventBlock, { key: 'Enter' });

      expect(onClick).toHaveBeenCalledWith(mockEvent);
    });

    it('キーボード操作でクリックイベントが発火する（Space）', () => {
      const onClick = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onClick={onClick} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.keyDown(eventBlock, { key: ' ' });

      expect(onClick).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('ドラッグ操作', () => {
    it('マウスダウンでドラッグ開始イベントが発火する', () => {
      const onDragStart = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onDragStart={onDragStart} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.mouseDown(eventBlock, { button: 0 });

      expect(onDragStart).toHaveBeenCalledWith(
        mockEvent,
        expect.any(Object),
        expect.objectContaining({
          top: mockPosition.top,
          left: mockPosition.left,
          width: mockPosition.width,
          height: mockPosition.height,
        }),
      );
    });

    it('ドラッグ中の状態が正しく反映される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} isDragging={true} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock.className).toContain('cursor-grabbing');
    });

    it('選択状態が正しく反映される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} isSelected={true} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock.className).toContain('ring-2');
    });
  });

  describe('リサイズ操作', () => {
    it('リサイズハンドルが存在する', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} />);

      const resizeHandle = screen.getByRole('slider', { name: /Resize entry duration/i });
      expect(resizeHandle).toBeInTheDocument();
    });

    it('過去の planned でもリサイズハンドルが存在する', () => {
      render(
        <EntryCard
          entry={{ ...mockEvent, origin: 'planned', entryState: 'past' }}
          position={mockPosition}
        />,
      );

      expect(screen.getByRole('slider', { name: /Resize entry duration/i })).toBeInTheDocument();
    });

    it('過去の unplanned でもリサイズハンドルが存在する', () => {
      render(
        <EntryCard
          entry={{ ...mockEvent, origin: 'unplanned', entryState: 'past' }}
          position={mockPosition}
        />,
      );

      expect(screen.getByRole('slider', { name: /Resize entry duration/i })).toBeInTheDocument();
    });

    it('リサイズハンドルのaria属性が正しく設定される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} />);

      const resizeHandle = screen.getByRole('slider');
      expect(resizeHandle).toHaveAttribute('aria-orientation', 'vertical');
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '60');
      expect(resizeHandle).toHaveAttribute('aria-valuemin', '14');
      expect(resizeHandle).toHaveAttribute('aria-valuemax', '480');
    });

    it('リサイズハンドルのマウスダウンでリサイズ開始イベントが発火する', () => {
      const onResizeStart = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onResizeStart={onResizeStart} />);

      const resizeHandle = screen.getByRole('slider');
      fireEvent.mouseDown(resizeHandle);

      expect(onResizeStart).toHaveBeenCalledWith(
        mockEvent,
        'bottom',
        expect.any(Object),
        mockPosition,
      );
    });

    it('PC の短い予定ではリサイズハンドルがカード下へ張り出さない', () => {
      render(<EntryCard entry={mockEvent} position={{ ...mockPosition, height: 25 }} />);

      const resizeHandle = screen.getByRole('slider', { name: /Resize entry duration/i });

      expect(resizeHandle).toHaveStyle({
        height: '25px',
        bottom: '0px',
      });
    });

    it('Mobile のアクティブ予定では指向けのリサイズ当たり判定を維持する', () => {
      render(
        <EntryCard
          entry={mockEvent}
          position={{ ...mockPosition, height: 25 }}
          isMobile
          isActive
        />,
      );

      const resizeHandle = screen.getByRole('slider', { name: /Resize entry duration/i });

      expect(resizeHandle).toHaveStyle({
        height: '44px',
        bottom: '-40px',
      });
    });
  });

  describe('スタイリング', () => {
    it('カスタムclassNameが適用される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} className="custom-class" />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock.className).toContain('custom-class');
    });

    it('カスタムstyleが適用される', () => {
      const customStyle = { backgroundColor: 'red' };
      render(<EntryCard entry={mockEvent} position={mockPosition} style={customStyle} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock).toHaveStyle({ backgroundColor: 'red' });
    });

    it('高さが30px未満の場合、コンパクトスタイルが適用される', () => {
      const smallPosition = { ...mockPosition, height: 25 };
      render(<EntryCard entry={mockEvent} position={smallPosition} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      const contentDiv = eventBlock.querySelector('.text-sm');
      expect(contentDiv).toBeTruthy();
    });

    it('最小高さが保証される', () => {
      const tinyPosition = { ...mockPosition, height: 5 };
      render(<EntryCard entry={mockEvent} position={tinyPosition} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      const heightMatch = eventBlock.style.height.match(/(\d+)px/);
      const height = heightMatch ? parseInt(heightMatch[1]!, 10) : 0;
      expect(height).toBeGreaterThanOrEqual(14);
    });
  });

  describe('イベント伝播', () => {
    it('クリックイベントの伝播が停止される', () => {
      const onClick = vi.fn();
      const parentClick = vi.fn();

      render(
        <div onClick={parentClick}>
          <EntryCard entry={mockEvent} position={mockPosition} onClick={onClick} />
        </div>,
      );

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.click(eventBlock);

      expect(onClick).toHaveBeenCalled();
      expect(parentClick).not.toHaveBeenCalled();
    });
  });
});
