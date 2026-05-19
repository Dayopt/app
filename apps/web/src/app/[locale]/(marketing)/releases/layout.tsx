// This layout is shared across locales, so metadata should be handled in individual pages
// Remove static metadata to avoid conflicts with page-level generateMetadata

export default function ReleasesLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-background min-h-screen">{children}</div>;
}
