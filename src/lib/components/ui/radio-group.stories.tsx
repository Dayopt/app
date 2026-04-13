import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';

/** RadioGroup - ラジオボタングループ（単一選択）。2-4個の選択肢に適切、5個以上はSelectを使用。 */
const meta = {
  title: 'Components/UI/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const [value1, setValue1] = useState('this');
    const [value2, setValue2] = useState('');

    const scopeOptions = [
      { value: 'this', label: 'このイベントのみ' },
      { value: 'thisAndFuture', label: 'このイベント以降すべて' },
      { value: 'all', label: 'すべてのイベント' },
    ];

    const tagOptions = [
      { value: 'tag-1', label: '仕事', color: 'blue' },
      { value: 'tag-2', label: 'プライベート', color: 'green' },
      { value: 'tag-3', label: '学習', color: 'amber' },
    ];

    return (
      <div className="flex flex-col items-start gap-6">
        <RadioGroup value={value1} onValueChange={setValue1} className="space-y-2">
          {scopeOptions.map((option) => (
            <label
              key={option.value}
              htmlFor={`scope-${option.value}`}
              className="flex cursor-pointer items-center gap-4"
            >
              <RadioGroupItem value={option.value} id={`scope-${option.value}`} />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </RadioGroup>

        <div className="border-border max-h-60 overflow-y-auto rounded-2xl border">
          <RadioGroup value={value2} onValueChange={setValue2} className="p-2">
            {tagOptions.map((option) => (
              <Label
                key={option.value}
                htmlFor={`tag-${option.value}`}
                className={`hover:bg-state-hover flex cursor-pointer items-center gap-4 rounded-lg px-4 py-2 transition-colors ${
                  value2 === option.value ? 'bg-state-selected' : ''
                }`}
              >
                <RadioGroupItem
                  value={option.value}
                  id={`tag-${option.value}`}
                  className="shrink-0"
                />
                <span className="shrink-0 font-normal" style={{ color: option.color }}>
                  #
                </span>
                <span className="flex-1 truncate text-sm">{option.label}</span>
              </Label>
            ))}
          </RadioGroup>
        </div>
      </div>
    );
  },
};
