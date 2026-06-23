import { generateSEOMetadata } from '@/platform/seo/metadata';
import { Button, Container, Heading, Text } from '@dayopt/components';
import Link from 'next/link';

export const metadata = generateSEOMetadata({
  title: 'Internal Server Error - 500 Error',
  description:
    'An internal server error occurred. Our team has been notified and is working to resolve the issue.',
  url: '/500',
  noindex: true,
});

export default function InternalServerError() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <Container>
        <div className="mx-auto max-w-md text-center">
          <div className="text-muted-foreground/20 mb-4 text-9xl font-medium">500</div>

          <Heading as="h2" size="xl" className="mb-4">
            Internal Server Error
          </Heading>

          <Text variant="muted" className="mb-8">
            Something went wrong on our end. Our team has been automatically notified and is working
            to fix this issue.
          </Text>

          <Button asChild className="w-full">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
