import { Heading } from '@/components/ui/typography';

interface ContentHeaderProps {
  title: string;
  subtitle?: string;
}

export function ContentHeader({ title, subtitle }: ContentHeaderProps) {
  return (
    <div className="mb-12">
      <Heading as="h1" size="3xl">
        {title}
      </Heading>
      {subtitle && <p className="text-muted-foreground mt-3 text-lg">{subtitle}</p>}
    </div>
  );
}
