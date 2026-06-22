import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { TAG_COLOR_MAP, TAG_COLOR_NAMES } from '../lib/tag-colors';

import type { TagColorName } from '../lib/tag-colors';

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@dayopt/components';
import { ColorPaletteMenuItems, getColorDisplayName } from './color-palette-picker';

const meta = {
  title: 'Components/UI/ColorPaletteMenuItems',
  component: ColorPaletteMenuItems,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ColorPaletteMenuItems>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  args: {
    selectedColor: 'blue',
    onColorSelect: () => {},
  },
  render: function ColorPaletteMenuItemsStory() {
    const t = useTranslations('common');
    const [color1, setColor1] = useState<TagColorName>('blue');
    const [color2, setColor2] = useState<TagColorName>('green');

    return (
      <div className="flex flex-col items-start gap-6">
        <div className="flex gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <span
                  className={cn('size-4 rounded-full', TAG_COLOR_MAP[color1].dot)}
                  aria-hidden
                />
                {getColorDisplayName(color1, t)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <ColorPaletteMenuItems
                selectedColor={color1}
                onColorSelect={(c) => setColor1(c as TagColorName)}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" icon aria-label="Select color">
                <span
                  className={cn('size-4 rounded-full', TAG_COLOR_MAP[color2].dot)}
                  aria-hidden
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <ColorPaletteMenuItems
                selectedColor={color2}
                onColorSelect={(c) => setColor2(c as TagColorName)}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 色名ラベル付きスウォッチ一覧 */}
        <div className="p-4">
          <h3 className="text-foreground mb-4 text-sm font-medium">色名ラベル付きスウォッチ</h3>
          <div className="grid grid-cols-5 gap-2">
            {TAG_COLOR_NAMES.map((colorName) => (
              <div key={colorName} className="flex flex-col items-center gap-1">
                <span
                  className={cn('size-9 rounded-full', TAG_COLOR_MAP[colorName].dot)}
                  aria-hidden
                />
                <span className="text-muted-foreground text-xs">
                  {getColorDisplayName(colorName, t)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
};
