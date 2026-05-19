import { Footer } from '@/shell/layout/Footer';
import { Header } from '@/shell/layout/Header';

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main-content" role="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
