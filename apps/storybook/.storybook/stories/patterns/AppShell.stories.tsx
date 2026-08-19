import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowLeft } from 'lucide-react';

import { DesktopLayout } from '@/app/[locale]/(app)/_shell/desktop-layout';
import { MobileLayout } from '@/app/[locale]/(app)/_shell/mobile-layout';
import { AppHeader } from '@/components/shell/AppHeader';
import { CalendarNavigationProvider } from '@/features/calendar';
import { Button } from '@dayopt/components';
import { StorybookPathnameProvider } from '@dayopt/storybook/mocks/next-intl-navigation';

import { PRESET_AUTH, PRESET_USER_SETTINGS } from '../../mocks/presets';

const PAST_DUE_OVERVIEW = {
  billingInfo: {
    subscriptionStatus: 'past_due',
    stripeCustomerId: 'cus_storybook',
    subscriptionId: 'sub_storybook',
  },
  paymentMethod: null,
  invoices: [],
  trialEndsAt: null,
};

const SHELL_STORE = {
  sidebar: { open: false, width: 256 },
  sidebarSuppressed: false,
  pageTitle: '',
};

type ShellPattern = 'desktop-calendar' | 'mobile-calendar' | 'mobile-settings';

interface AppShellPreviewProps {
  pattern: ShellPattern;
}

function CalendarOwnHeader({ mobile = false }: { mobile?: boolean }) {
  return (
    <AppHeader>
      <h1 className="truncate text-lg font-medium">
        {mobile ? 'March 25' : 'Wednesday, March 25'}
      </h1>
    </AppHeader>
  );
}

function SettingsOwnHeader() {
  return (
    <AppHeader
      leftSlot={
        <Button type="button" variant="ghost" size="sm" icon aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <h1 className="truncate text-lg font-medium">Billing</h1>
    </AppHeader>
  );
}

function CalendarSurface() {
  return (
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="border-border grid flex-1 grid-cols-4 border-t">
        {Array.from({ length: 16 }, (_, index) => (
          <div key={index} className="border-border-subtle border-r border-b" />
        ))}
      </div>
    </div>
  );
}

function SettingsSurface() {
  return (
    <div className="bg-background flex flex-1 flex-col gap-4 p-4">
      <div className="bg-surface-container h-12 rounded-lg" />
      <div className="bg-surface-container h-20 rounded-lg" />
      <div className="bg-surface-container h-16 rounded-lg" />
    </div>
  );
}

/** 実App Shellと代表的な自前headerを合成するpast_dueプレビュー。 */
function AppShellPreview({ pattern }: AppShellPreviewProps) {
  const mobile = pattern !== 'desktop-calendar';
  const settings = pattern === 'mobile-settings';
  const content = settings ? (
    <>
      <SettingsOwnHeader />
      <SettingsSurface />
    </>
  ) : (
    <>
      <CalendarOwnHeader mobile={mobile} />
      <CalendarSurface />
    </>
  );

  return (
    <CalendarNavigationProvider>
      <div className="bg-background h-full min-h-0 overflow-hidden">
        {mobile ? <MobileLayout>{content}</MobileLayout> : <DesktopLayout>{content}</DesktopLayout>}
      </div>
    </CalendarNavigationProvider>
  );
}

const meta = {
  title: 'Product/Patterns/AppShell',
  component: AppShellPreview,
  parameters: {
    layout: 'fullscreen',
    trpcMocks: {
      'billing.getOverview': PAST_DUE_OVERVIEW,
      'tags.list': { data: [] },
      'tags.listArchived': [],
      'statistics.getTagStats': { counts: {}, planCounts: {}, lastUsed: {} },
      'userSettings.get': PRESET_USER_SETTINGS.default,
    },
    storeMocks: {
      useAuthStore: PRESET_AUTH.authenticated,
      useShellStore: SHELL_STORE,
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AppShellPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** prefixなし英語calendarでshell headerを重複させずpast_due bannerを表示する。 */
export const DesktopCalendarPastDue: Story = {
  args: { pattern: 'desktop-calendar' },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/day',
        query: { date: '2026-03-25' },
      },
    },
  },
};

/** mobile calendarの自前header直前にpast_due bannerを表示する。 */
export const MobileCalendarPastDue: Story = {
  args: { pattern: 'mobile-calendar' },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/day',
        query: { date: '2026-03-25' },
      },
    },
  },
  globals: {
    viewport: { value: 'mobile1' },
  },
};

/** mobile settingsの自前header直前にpast_due bannerを表示する。 */
export const MobileSettingsPastDue: Story = {
  args: { pattern: 'mobile-settings' },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/settings/billing',
        query: { returnTo: '/day?date=2026-03-25' },
      },
    },
  },
  globals: {
    viewport: { value: 'mobile1' },
  },
};

/** calendarとsettingsのApp Shell配置を一画面で比較する。 */
export const AllPatterns: Story = {
  args: { pattern: 'desktop-calendar' },
  render: () => (
    <div className="bg-muted grid gap-6 p-6">
      <StorybookPathnameProvider pathname="/day">
        <div className="border-border bg-background h-96 overflow-hidden rounded-lg border">
          <AppShellPreview pattern="desktop-calendar" />
        </div>
      </StorybookPathnameProvider>
      <div className="flex flex-wrap gap-6">
        <StorybookPathnameProvider pathname="/day">
          <div
            className="border-border bg-background h-96 w-80 overflow-hidden rounded-lg border"
            aria-hidden="true"
            inert
          >
            <AppShellPreview pattern="mobile-calendar" />
          </div>
        </StorybookPathnameProvider>
        <StorybookPathnameProvider pathname="/settings/billing">
          <div
            className="border-border bg-background h-96 w-80 overflow-hidden rounded-lg border"
            aria-hidden="true"
            inert
          >
            <AppShellPreview pattern="mobile-settings" />
          </div>
        </StorybookPathnameProvider>
      </div>
    </div>
  ),
};
