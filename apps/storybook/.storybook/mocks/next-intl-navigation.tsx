import type { AnchorHTMLAttributes, ReactNode } from 'react';

/**
 * Storybook用 next-intl/navigation モック
 *
 * next-intl/navigation は内部で React を暗黙的に参照するため、
 * Storybook のバンドルで ReferenceError: React is not defined が発生する。
 * このモックで createNavigation の返り値を再現する。
 */

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

function MockLink({ href, children, ...props }: LinkProps) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

export function createNavigation() {
  return {
    Link: MockLink,
    redirect: () => undefined,
    usePathname: () => '/',
    useRouter: () => ({
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: () => {},
    }),
    getPathname: () => '/',
  };
}
