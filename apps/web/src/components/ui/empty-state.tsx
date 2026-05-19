import { Button } from '@/components/ui/button';
import { Heading, Text } from '@/components/ui/typography';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="py-16 text-center" role="status">
      <div className="bg-muted mx-auto mb-6 flex size-24 items-center justify-center rounded-full">
        <Icon className="text-muted-foreground size-10" aria-hidden="true" />
      </div>
      <Heading as="h3" size="lg" className="mb-2">
        {title}
      </Heading>
      <Text variant="muted" className="mb-4">
        {description}
      </Text>
      {action && (
        <Button onClick={action.onClick} variant="outline">
          {action.label}
        </Button>
      )}
    </div>
  );
}
