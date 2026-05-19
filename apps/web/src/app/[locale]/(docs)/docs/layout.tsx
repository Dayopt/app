import { ClientSidebar, DocsHeader } from '@/features/docs';
import { Footer } from '@/shell/layout/Footer';
import { generateDocsNavigation } from '@/shell/navigation';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const navigation = generateDocsNavigation();

  return (
    <div className="bg-background fixed inset-0 flex flex-col overflow-hidden">
      {/* Docs専用ヘッダー（固定） */}
      <DocsHeader />

      {/* 3カラムレイアウト: Sidebar(240px) | Main(flex-1) | TOC(240px, xl以上) */}
      <div className="max-w-8xl mx-auto flex min-h-0 w-full flex-1 overflow-hidden">
        {/* Left Sidebar - Navigation (lg以上で表示) */}
        <aside className="bg-container hidden w-60 flex-shrink-0 overflow-y-auto lg:block">
          <div className="px-4 py-8">
            <ClientSidebar navigation={navigation} />
          </div>
        </aside>

        {/* Main Content + Footer */}
        <main
          id="main-content"
          role="main"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="flex-1">{children}</div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
