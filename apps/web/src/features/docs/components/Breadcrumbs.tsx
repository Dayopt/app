import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { generateBreadcrumbs } from '@/lib/mdx';
import Link from 'next/link';
import { Fragment } from 'react';

interface BreadcrumbsProps {
  slug: string;
  title?: string;
}

export function Breadcrumbs({ slug, title }: BreadcrumbsProps) {
  const breadcrumbs = generateBreadcrumbs(slug);

  return (
    <Breadcrumb className="mb-6">
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <Fragment key={`${crumb.href}-${index}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{title || crumb.title}</BreadcrumbPage>
                ) : crumb.clickable === false ? (
                  <span className="text-muted-foreground">{crumb.title}</span>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.title}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
