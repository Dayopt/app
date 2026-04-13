import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { InputOTP, InputOTPGroup, InputOTPSlot } from './input-otp';

const meta = {
  title: 'Components/UI/InputOTP',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPatterns: Story = {
  render: function AllPatternsStory() {
    const [value, setValue] = useState('');

    return (
      <div className="flex flex-col items-start gap-6">
        <InputOTP maxLength={6} value={value} onChange={setValue} aria-label="One-time password">
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
    );
  },
};
