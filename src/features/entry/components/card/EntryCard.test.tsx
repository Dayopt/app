import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CalendarEvent } from '@/types/calendar-event';

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

      expect(screen.getByRole('slider', { name: /entry: テストイベント/i })).toBeInTheDocument();
    });

    it('デフォルトポジションが適用される', () => {
      render(<EntryCard entry={mockEvent} position={undefined} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      expect(eventBlock).toBeInTheDocument();
    });

    it('aria属性が正しく設定される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      expect(eventBlock).toHaveAttribute('aria-label', 'entry: テストイベント');
      expect(eventBlock).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('インタラクション', () => {
    it('クリックイベントが発火する', () => {
      const onClick = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onClick={onClick} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      fireEvent.click(eventBlock);

      expect(onClick).toHaveBeenCalledWith(mockEvent);
    });

    it('右クリックでコンテキストメニューが表示される', () => {
      const onContextMenu = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onContextMenu={onContextMenu} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      fireEvent.contextMenu(eventBlock);

      expect(onContextMenu).toHaveBeenCalledWith(mockEvent, expect.any(Object));
    });

    it('キーボード操作でクリックイベントが発火する（Enter）', () => {
      const onClick = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onClick={onClick} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      fireEvent.keyDown(eventBlock, { key: 'Enter' });

      expect(onClick).toHaveBeenCalledWith(mockEvent);
    });

    it('キーボード操作でクリックイベントが発火する（Space）', () => {
      const onClick = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onClick={onClick} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      fireEvent.keyDown(eventBlock, { key: ' ' });

      expect(onClick).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('ドラッグ操作', () => {
    it('マウスダウンでドラッグ開始イベントが発火する', () => {
      const onDragStart = vi.fn();
      render(<EntryCard entry={mockEvent} position={mockPosition} onDragStart={onDragStart} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
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

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      expect(eventBlock.className).toContain('cursor-grabbing');
    });

    it('選択状態が正しく反映される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} isSelected={true} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      expect(eventBlock.className).toContain('ring-2');
    });
  });

  describe('リサイズ操作', () => {
    it('リサイズハンドルが存在する', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} />);

      const resizeHandle = screen.getByRole('slider', { name: /Resize entry duration/i });
      expect(resizeHandle).toBeInTheDocument();
    });

    it('リサイズハンドルのaria属性が正しく設定される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} />);

      const resizeHandle = screen.getByRole('slider');
      expect(resizeHandle).toHaveAttribute('aria-orientation', 'vertical');
      expect(resizeHandle).toHaveAttribute('aria-valuenow', '60');
      expect(resizeHandle).toHaveAttribute('aria-valuemin', '20');
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
  });

  describe('スタイリング', () => {
    it('カスタムclassNameが適用される', () => {
      render(<EntryCard entry={mockEvent} position={mockPosition} className="custom-class" />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      expect(eventBlock.className).toContain('custom-class');
    });

    it('カスタムstyleが適用される', () => {
      const customStyle = { backgroundColor: 'red' };
      render(<EntryCard entry={mockEvent} position={mockPosition} style={customStyle} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      expect(eventBlock).toHaveStyle({ backgroundColor: 'red' });
    });

    it('高さが30px未満の場合、コンパクトスタイルが適用される', () => {
      const smallPosition = { ...mockPosition, height: 25 };
      render(<EntryCard entry={mockEvent} position={smallPosition} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      const contentDiv = eventBlock.querySelector('.text-sm');
      expect(contentDiv).toBeTruthy();
    });

    it('最小高さが保証される', () => {
      const tinyPosition = { ...mockPosition, height: 5 };
      render(<EntryCard entry={mockEvent} position={tinyPosition} />);

      const eventBlock = screen.getByRole('slider', { name: /entry: テストイベント/i });
      const heightMatch = eventBlock.style.height.match(/(\d+)px/);
      const height = heightMatch ? parseInt(heightMatch[1]!, 10) : 0;
      expect(height).toBeGreaterThanOrEqual(20);
    });
  });

  describe('イベント伝播', () => {
    it('クリックイベントの伝播が停止される', () => {
      const onClick = vi.fn();
      const parentClick = vi.fn();

      const { container } = render(
        <div onClick={parentClick}>
          <EntryCard entry={mockEvent} position={mockPosition} onClick={onClick} />
        </div>,
      );

      const eventBlock = container.querySelector('[role="group"]');
      if (eventBlock) {
        fireEvent.click(eventBlock);
      }

      expect(onClick).toHaveBeenCalled();
      expect(parentClick).not.toHaveBeenCalled();
    });
  });
});
