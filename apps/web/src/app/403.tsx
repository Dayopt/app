import { Button, Container, Heading, Text } from '@dayopt/components';
import { generateSEOMetadata } from '@web/platform/seo/metadata';
import Link from 'next/link';

export const metadata = generateSEOMetadata({
  title: 'Access Forbidden - 403 Error',
  description:
    'You do not have permission to access this resource. Please check your credentials or contact support.',
  url: '/403',
  noindex: true,
});

export default function Forbidden() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <Container>
        <div className="mx-auto max-w-md text-center">
          <div className="text-muted-foreground mb-4 text-sm tabular-nums">403</div>

          <Heading as="h2" size="xl" className="mb-4">
            Access Forbidden
          </Heading>

          <Text variant="muted" className="mb-8">
            You don&apos;t have permission to access this resource. Please check your credentials or
            contact support if you believe this is an error.
          </Text>

          <Button asChild className="w-full">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
