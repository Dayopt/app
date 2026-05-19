/**
 * 法的文書ページ用レイアウト
 *
 * @description
 * 法的文書ページ（/legal/privacy, /legal/terms等）で使用。
 * 親レイアウトの共通Header/Footerを使用。
 */
import type { ReactNode } from 'react';

interface LegalLayoutProps {
  children: ReactNode;
}

export default function LegalLayout({ children }: LegalLayoutProps) {
  return <div className="bg-background">{children}</div>;
}
