export interface NavItem {
  name: string;
  href?: string;
  description?: string;
  items?: NavItem[];
}

export interface NavSection {
  name: string;
  items: NavItem[];
}

// Navigation types for docs sidebar
export interface NavigationItem {
  title: string;
  href?: string;
  items?: NavigationItem[];
  badge?: string;
  external?: boolean;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

// Generate docs navigation structure
export function generateDocsNavigation(): NavigationSection[] {
  return [
    {
      title: 'Getting Started',
      items: [
        { title: 'Introduction', href: '/docs' },
        { title: 'Quick Start', href: '/docs/getting-started/quick-start' },
        { title: 'UI Overview', href: '/docs/getting-started/ui-overview' },
      ],
    },
    {
      title: 'Features',
      items: [
        { title: 'Plans', href: '/docs/features/plans' },
        { title: 'Records', href: '/docs/features/records' },
        { title: 'Calendar', href: '/docs/features/calendar' },
        { title: 'Tags', href: '/docs/features/tags' },
        { title: 'Stats', href: '/docs/features/stats' },
        { title: 'Search', href: '/docs/features/search' },
        { title: 'Keyboard Shortcuts', href: '/docs/features/shortcuts' },
      ],
    },
    {
      title: 'Guides',
      items: [
        { title: 'Timeboxing', href: '/docs/guides/timeboxing' },
        { title: 'Weekly Review', href: '/docs/guides/weekly-review' },
        { title: 'Data Export', href: '/docs/guides/data-export' },
      ],
    },
    {
      title: 'Troubleshooting',
      items: [
        { title: 'Overview', href: '/docs/troubleshooting' },
        { title: 'Account & Login', href: '/docs/troubleshooting/account' },
        { title: 'App Issues', href: '/docs/troubleshooting/app' },
        { title: 'Sync Issues', href: '/docs/troubleshooting/sync' },
      ],
    },
    {
      title: 'Account',
      items: [
        { title: 'Profile', href: '/docs/account/profile' },
        { title: 'Notifications', href: '/docs/account/notifications' },
      ],
    },
    {
      title: 'FAQ',
      items: [
        { title: 'Overview', href: '/docs/faq' },
        { title: 'Features', href: '/docs/faq/features' },
        { title: 'Comparisons', href: '/docs/faq/comparison' },
        { title: 'Privacy & Security', href: '/docs/faq/privacy-security' },
        { title: 'Pricing', href: '/docs/faq/pricing' },
        { title: 'Technical', href: '/docs/faq/technical' },
        { title: 'Philosophy', href: '/docs/faq/philosophy' },
        { title: 'General', href: '/docs/faq/general' },
      ],
    },
  ];
}
