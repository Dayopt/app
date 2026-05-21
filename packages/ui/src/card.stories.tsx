import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Badge } from './badge';
import { Button } from './button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Weekly review</CardTitle>
        <CardDescription>Shared primitives stay free of domain logic.</CardDescription>
        <CardAction>
          <Badge variant="success">Ready</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[var(--dayopt-color-muted-foreground)]">
          Card surfaces use the Dayopt token contract without importing app runtime code.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Open</Button>
        <Button size="sm" variant="outline">
          Dismiss
        </Button>
      </CardFooter>
    </Card>
  ),
};
