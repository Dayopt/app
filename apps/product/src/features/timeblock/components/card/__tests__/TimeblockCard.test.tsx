import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CalendarEvent } from '../../../types/calendar-event';

import { TimeblockCard } from '../TimeblockCard';

describe('TimeblockCard', () => {
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
    version: '2026-07-15T00:00:00.000000Z',
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
    it('timeFormatをカード内容へ渡す', () => {
      render(
        <TimeblockCard
          entry={{ ...mockEvent, origin: 'planned', timeblockState: 'upcoming' }}
          position={mockPosition}
          timeFormat="12h"
        />,
      );

      expect(screen.getByText('10:00 AM 〜 11:00 AM')).toBeInTheDocument();
    });

    it('イベントが正しく表示される', () => {
      render(<TimeblockCard entry={mockEvent} position={mockPosition} />);

      expect(screen.getByLabelText(/entry: テストイベント/i)).toBeInTheDocument();
    });

    it('デフォルトポジションが適用される', () => {
      render(<TimeblockCard entry={mockEvent} position={undefined} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock).toBeInTheDocument();
    });

    it('aria属性が正しく設定される', () => {
      render(<TimeblockCard entry={mockEvent} position={mockPosition} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock).toHaveAttribute('aria-label', 'entry: テストイベント');
      expect(eventBlock).toHaveAttribute('tabIndex', '0');
      expect(eventBlock).toHaveClass('focus-visible:ring-ring');
    });

    it('day compare marker を表示できる', () => {
      const { container } = render(
        <TimeblockCard entry={mockEvent} position={mockPosition} showDayDiffMarker />,
      );

      expect(container.querySelector('[data-entry-day-diff-marker]')).toBeInTheDocument();
    });
  });

  describe('planned / actual レイヤー表示', () => {
    it('planned entry は planned 背景と actual カードを重ねて表示する', () => {
      const { container } = render(
        <TimeblockCard
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

    it('upcoming planned entry でも actual があれば記録レイヤーを表示する', () => {
      const { container } = render(
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            timeblockState: 'upcoming',
            actualStartDate: new Date('2025-01-15T10:15:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
        />,
      );

      const root = screen.getByLabelText(/entry: テストイベント/i);
      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');
      const contentLayer = container.querySelector<HTMLElement>('[data-entry-content-layer]');

      expect(root).toHaveStyle({
        top: '100px',
        left: '10%',
        width: 'calc(80% - 8px)',
        height: '60px',
      });
      expect(plannedLayer).toHaveClass('rounded-r-lg');
      expect(plannedLayer).toHaveStyle({ top: '0px', left: '-1px', height: '60px' });
      expect(actualLayer).toHaveStyle({ top: '18px', height: '42px' });
      expect(contentLayer).toHaveStyle({ top: '18px', height: '42px' });
      expect(container.querySelector('[data-entry-actual-accent]')).toBeInTheDocument();
    });

    it('予定と actual が一致する upcoming planned entry は予定表示にする', () => {
      const { container } = render(
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            timeblockState: 'upcoming',
            plannedStartDate: mockEvent.startDate,
            plannedEndDate: mockEvent.endDate,
            actualStartDate: mockEvent.startDate,
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
        />,
      );

      expect(container.querySelector('[data-entry-actual-layer]')).not.toBeInTheDocument();
      expect(container.querySelector('[data-entry-actual-accent]')).not.toBeInTheDocument();
      expect(container.querySelector('[data-entry-time-kind="planned"]')).toBeInTheDocument();
      expect(container.querySelector('[data-entry-time-kind="actual"]')).not.toBeInTheDocument();
    });

    it('upcoming planned entry の actual 超過部分も予定外表示を維持する', () => {
      const { container } = render(
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            timeblockState: 'upcoming',
            actualStartDate: mockEvent.startDate,
            actualEndDate: new Date('2025-01-15T11:30:00'),
          }}
          position={mockPosition}
        />,
      );

      const root = screen.getByLabelText(/entry: テストイベント/i);
      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');
      const overtimeAccent = container.querySelector<HTMLElement>('[data-entry-overtime-accent]');

      expect(root).toHaveStyle({ top: '100px', height: '60px' });
      expect(plannedLayer).toHaveStyle({ top: '0px', left: '-1px', height: '60px' });
      expect(actualLayer).toHaveStyle({ top: '0px', height: '24px' });
      expect(overtimeAccent).toBeInTheDocument();
    });

    it('drag preview の relative 配置でも actual 超過表示を維持する', () => {
      const { container } = render(
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            timeblockState: 'upcoming',
            actualStartDate: mockEvent.startDate,
            actualEndDate: new Date('2025-01-15T11:30:00'),
          }}
          position={mockPosition}
          plannedHeight={mockPosition.height}
          style={{ position: 'relative' }}
        />,
      );

      expect(screen.getByLabelText(/entry: テストイベント/i)).toHaveStyle({ height: '60px' });
      expect(container.querySelector('[data-entry-overtime-accent]')).toBeInTheDocument();
    });

    it('actual が planned より短い場合は planned 背景が露出する', () => {
      const { container } = render(
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: new Date('2025-01-15T10:15:00'),
            actualEndDate: new Date('2025-01-15T10:45:00'),
          }}
          position={mockPosition}
        />,
      );

      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');

      expect(plannedLayer).toHaveStyle({ top: '0px', left: '-1px', height: '60px' });
      expect(actualLayer).toHaveStyle({ top: '18px', height: '24px' });
      expect(container.querySelector('.pattern-hatch')).not.toBeInTheDocument();
    });

    it('actual 開始が遅れた前半 gap から予定外記録の作成範囲を返す', () => {
      const onGapClick = vi.fn();
      const { container } = render(
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: new Date('2025-01-15T10:30:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
          onGapClick={onGapClick}
        />,
      );

      const topGap = container.querySelector<HTMLElement>('[data-entry-gap="top"]');
      const gapAction = topGap?.querySelector<HTMLElement>('[data-entry-gap-action]');

      expect(topGap).toHaveAttribute('role', 'button');
      expect(topGap).toHaveStyle({ top: '0px', height: '36px' });
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
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: new Date('2025-01-15T10:30:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
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
        <TimeblockCard
          entry={{
            ...mockEvent,
            startDate: new Date('2030-01-15T10:00:00'),
            endDate: new Date('2030-01-15T11:00:00'),
            origin: 'planned',
            actualStartDate: new Date('2030-01-15T10:30:00'),
            actualEndDate: new Date('2030-01-15T11:00:00'),
          }}
          position={mockPosition}
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
        <TimeblockCard
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
        />,
      );

      const root = screen.getByLabelText(/entry: テストイベント/i);
      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');
      const contentLayer = container.querySelector<HTMLElement>('[data-entry-content-layer]');

      expect(root).toHaveStyle({ top: '100px', height: '120px' });
      expect(plannedLayer).toHaveStyle({ top: '0px', left: '-1px', height: '120px' });
      expect(actualLayer).toHaveStyle({ top: '36px', height: '48px' });
      expect(contentLayer).toHaveStyle({ top: '36px', height: '48px' });
    });

    it('actual が planned を超過した場合は従来の破線オーバーレイを維持する', () => {
      const { container } = render(
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: new Date('2025-01-15T09:30:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
        />,
      );

      const root = screen.getByLabelText(/entry: テストイベント/i);
      const plannedLayer = container.querySelector<HTMLElement>('[data-entry-planned-layer]');
      const actualLayer = container.querySelector<HTMLElement>('[data-entry-actual-layer]');
      const actualBody = container.querySelector<HTMLElement>('[data-entry-actual-body]');
      const overtimeAccent = container.querySelector<HTMLElement>('[data-entry-overtime-accent]');

      expect(root).toHaveStyle({ top: '100px', height: '60px' });
      expect(plannedLayer).toHaveStyle({ top: '36px', left: '-1px', height: '60px' });
      expect(actualLayer).toHaveStyle({ top: '36px', height: '24px' });
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

    it('actual が planned を超過した部分の地色は予定外 entry と揃える', () => {
      const { container: plannedContainer } = render(
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            actualStartDate: new Date('2025-01-15T09:30:00'),
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
        />,
      );
      const { container: unplannedContainer } = render(
        <TimeblockCard
          entry={{
            ...mockEvent,
            id: 'unplanned-entry',
            origin: 'unplanned',
            actualStartDate: mockEvent.startDate,
            actualEndDate: mockEvent.endDate,
          }}
          position={mockPosition}
        />,
      );

      const overtimeAccent = plannedContainer.querySelector<HTMLElement>(
        '[data-entry-overtime-accent]',
      );
      const overtimeLayer = overtimeAccent?.parentElement as HTMLElement | null;
      const unplannedBody = unplannedContainer.querySelector<HTMLElement>(
        '[data-entry-actual-body]',
      );

      expect(overtimeLayer).toHaveStyle({
        backgroundColor: unplannedBody?.style.backgroundColor,
      });
    });

    it('unplanned entry は planned 背景を描かず点線の actual のみ表示する', () => {
      const { container } = render(
        <TimeblockCard
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
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            timeblockState: 'active',
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
        <TimeblockCard
          entry={{
            ...mockEvent,
            origin: 'planned',
            timeblockState: 'past',
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
      render(<TimeblockCard entry={mockEvent} position={mockPosition} onClick={onClick} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.click(eventBlock);

      expect(onClick).toHaveBeenCalledWith(mockEvent);
    });

    it('右クリックでコンテキストメニューが表示される', () => {
      const onContextMenu = vi.fn();
      render(
        <TimeblockCard entry={mockEvent} position={mockPosition} onContextMenu={onContextMenu} />,
      );

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.contextMenu(eventBlock);

      expect(onContextMenu).toHaveBeenCalledWith(mockEvent, expect.any(Object));
    });

    it('キーボード操作でクリックイベントが発火する（Enter）', () => {
      const onClick = vi.fn();
      render(<TimeblockCard entry={mockEvent} position={mockPosition} onClick={onClick} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.keyDown(eventBlock, { key: 'Enter' });

      expect(onClick).toHaveBeenCalledWith(mockEvent);
    });

    it('キーボード操作でクリックイベントが発火する（Space）', () => {
      const onClick = vi.fn();
      render(<TimeblockCard entry={mockEvent} position={mockPosition} onClick={onClick} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.keyDown(eventBlock, { key: ' ' });

      expect(onClick).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('ドラッグ操作', () => {
    it('マウスダウンでドラッグ開始イベントが発火する', () => {
      const onDragStart = vi.fn();
      render(<TimeblockCard entry={mockEvent} position={mockPosition} onDragStart={onDragStart} />);

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
      render(<TimeblockCard entry={mockEvent} position={mockPosition} isDragging={true} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock.className).toContain('cursor-grabbing');
    });

    it('選択状態が正しく反映される', () => {
      render(<TimeblockCard entry={mockEvent} position={mockPosition} isSelected={true} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock.className).toContain('ring-2');
    });
  });

  describe('リサイズ操作', () => {
    it('リサイズハンドルが存在する', () => {
      render(<TimeblockCard entry={mockEvent} position={mockPosition} />);

      const resizeHandle = screen.getByRole('slider', { name: /Resize entry duration/i });
      expect(resizeHandle).toBeInTheDocument();
    });

    it('過去の planned でもリサイズハンドルが存在する', () => {
      render(
        <TimeblockCard
          entry={{ ...mockEvent, origin: 'planned', timeblockState: 'past' }}
          position={mockPosition}
        />,
      );

      expect(screen.getByRole('slider', { name: /Resize entry duration/i })).toBeInTheDocument();
    });

    it('過去の unplanned でもリサイズハンドルが存在する', () => {
      render(
        <TimeblockCard
          entry={{ ...mockEvent, origin: 'unplanned', timeblockState: 'past' }}
          position={mockPosition}
        />,
      );

      expect(screen.getByRole('slider', { name: /Resize entry duration/i })).toBeInTheDocument();
    });

    it('リサイズハンドルのaria属性が正しく設定される', () => {
      render(<TimeblockCard entry={mockEvent} position={mockPosition} />);

      const resizeHandle = screen.getByRole('slider');
      expect(resizeHandle).toHaveAttribute('aria-orientation', 'vertical');
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '60');
      expect(resizeHandle).toHaveAttribute('aria-valuemin', '14');
      expect(resizeHandle).toHaveAttribute('aria-valuemax', '480');
    });

    it('リサイズハンドルのマウスダウンでリサイズ開始イベントが発火する', () => {
      const onResizeStart = vi.fn();
      render(
        <TimeblockCard entry={mockEvent} position={mockPosition} onResizeStart={onResizeStart} />,
      );

      const resizeHandle = screen.getByRole('slider');
      fireEvent.mouseDown(resizeHandle);

      expect(onResizeStart).toHaveBeenCalledWith(
        mockEvent,
        'bottom',
        expect.any(Object),
        mockPosition,
      );
    });

    it('PC の短い予定では中央ハンドル以外にクリック領域を残す', () => {
      render(<TimeblockCard entry={mockEvent} position={{ ...mockPosition, height: 25 }} />);

      const resizeHandle = screen.getByRole('slider', { name: /Resize entry duration/i });

      expect(resizeHandle).toHaveStyle({
        height: '25px',
        bottom: '0px',
        left: '50%',
        right: 'auto',
        width: '32px',
        transform: 'translateX(-50%)',
      });
    });

    it('最短 entry のカード本体をクリックすると Inspector 用 onClick が発火する', () => {
      const onClick = vi.fn();
      render(
        <TimeblockCard
          entry={mockEvent}
          position={{ ...mockPosition, height: 14 }}
          onClick={onClick}
        />,
      );

      fireEvent.click(screen.getByLabelText(/entry: テストイベント/i));

      expect(onClick).toHaveBeenCalledWith(mockEvent);
      expect(screen.getByRole('slider')).toHaveStyle({
        left: '50%',
        right: 'auto',
        width: '32px',
      });
    });

    it('通常高さの予定では下端全幅のリサイズ領域を維持する', () => {
      render(<TimeblockCard entry={mockEvent} position={mockPosition} />);

      expect(screen.getByRole('slider')).toHaveStyle({
        left: '0px',
        right: '0px',
        width: 'auto',
      });
    });

    it('Mobile のアクティブ予定では指向けのリサイズ当たり判定を維持する', () => {
      render(
        <TimeblockCard
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
      render(<TimeblockCard entry={mockEvent} position={mockPosition} className="custom-class" />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock.className).toContain('custom-class');
    });

    it('カスタムstyleが適用される', () => {
      const customStyle = { backgroundColor: 'red' };
      render(<TimeblockCard entry={mockEvent} position={mockPosition} style={customStyle} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      expect(eventBlock).toHaveStyle({ backgroundColor: 'red' });
    });

    it('高さが30px未満の場合、コンパクトスタイルが適用される', () => {
      const smallPosition = { ...mockPosition, height: 25 };
      render(<TimeblockCard entry={mockEvent} position={smallPosition} />);

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      const contentDiv = eventBlock.querySelector('.text-sm');
      expect(contentDiv).toBeTruthy();
    });

    it('最小高さが保証される', () => {
      const tinyPosition = { ...mockPosition, height: 5 };
      render(<TimeblockCard entry={mockEvent} position={tinyPosition} />);

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
          <TimeblockCard entry={mockEvent} position={mockPosition} onClick={onClick} />
        </div>,
      );

      const eventBlock = screen.getByLabelText(/entry: テストイベント/i);
      fireEvent.click(eventBlock);

      expect(onClick).toHaveBeenCalled();
      expect(parentClick).not.toHaveBeenCalled();
    });
  });
});
