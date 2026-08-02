import type { ReactNode } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import {
  GoogleCalendarConnectionView,
  GoogleCalendarSettingsView,
  type GoogleCalendarConnectionViewProps,
} from './GoogleCalendarSettingsView';

const ACTIONS = {
  onToggleCalendar: fn(),
  onRetryCalendars: fn(),
  onApply: fn(),
  onSync: fn(),
  onReconnect: fn(),
  onDisconnect: fn(),
};

const ACTIVE_CONNECTION: GoogleCalendarConnectionViewProps = {
  email: 'work@example.com',
  lastSyncedLabel: 'Aug 2, 2026, 10:30 AM',
  statusLabel: 'Connected',
  statusVariant: 'success',
  persistedError: null,
  needsReauth: false,
  reconnectAvailable: true,
  calendars: [
    { id: 'primary', name: 'Work', primary: true, selected: true },
    { id: 'focus', name: 'Focus time', primary: false, selected: false },
  ],
  selectedCalendarIds: new Set(['primary']),
  calendarsLoading: false,
  calendarsError: false,
  applying: false,
  syncing: false,
  disconnecting: false,
  selectionDirty: false,
  ...ACTIONS,
};

function SettingsState({
  loading = false,
  error = false,
  available = true,
  availabilityLoading = false,
  children,
}: {
  loading?: boolean;
  error?: boolean;
  available?: boolean;
  availabilityLoading?: boolean;
  children?: ReactNode;
}) {
  return (
    <GoogleCalendarSettingsView
      loading={loading}
      error={error}
      available={available}
      availabilityLoading={availabilityLoading}
      hasConnections={Boolean(children)}
      onRetry={fn()}
      onConnect={fn()}
    >
      {children}
    </GoogleCalendarSettingsView>
  );
}

function MultipleAccountsState() {
  return (
    <SettingsState>
      <GoogleCalendarConnectionView {...ACTIVE_CONNECTION} />
      <GoogleCalendarConnectionView
        {...ACTIVE_CONNECTION}
        email="personal@example.com"
        lastSyncedLabel="Aug 2, 2026, 9:45 AM"
        calendars={[
          { id: 'personal', name: 'Personal', primary: true, selected: true },
          { id: 'family', name: 'Family', primary: false, selected: true },
        ]}
        selectedCalendarIds={new Set(['personal', 'family'])}
      />
    </SettingsState>
  );
}

function ReauthorizationRequiredState() {
  return (
    <SettingsState>
      <GoogleCalendarConnectionView
        {...ACTIVE_CONNECTION}
        statusLabel="Reconnect required"
        statusVariant="warning"
        persistedError="Google access has expired. Reconnect the same Google account."
        needsReauth
        calendars={[]}
        selectedCalendarIds={new Set()}
      />
    </SettingsState>
  );
}

function PersistedSyncErrorState() {
  return (
    <SettingsState>
      <GoogleCalendarConnectionView
        {...ACTIVE_CONNECTION}
        statusLabel="Needs attention"
        statusVariant="warning"
        persistedError="Some calendars could not be synced. Review the selection and try again."
      />
    </SettingsState>
  );
}

const meta = {
  title: 'Product/Features/ExternalCalendar/GoogleCalendarSettings',
  component: GoogleCalendarSettingsView,
  args: {
    loading: false,
    error: false,
    availabilityLoading: false,
    available: true,
    hasConnections: false,
    onRetry: fn(),
    onConnect: fn(),
  },
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GoogleCalendarSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AvailableDisconnected: Story = {
  render: () => <SettingsState />,
};

export const Unavailable: Story = {
  render: () => <SettingsState available={false} />,
};

export const MultipleAccounts: Story = {
  render: () => <MultipleAccountsState />,
};

export const ReauthorizationRequired: Story = {
  render: () => <ReauthorizationRequiredState />,
};

export const PersistedSyncError: Story = {
  render: () => <PersistedSyncErrorState />,
};

export const Loading: Story = {
  render: () => <SettingsState loading availabilityLoading />,
};

export const QueryError: Story = {
  render: () => <SettingsState error />,
};

export const AllPatterns: Story = {
  render: () => (
    <div className="space-y-8">
      <SettingsState />
      <SettingsState available={false} />
      <MultipleAccountsState />
      <ReauthorizationRequiredState />
      <PersistedSyncErrorState />
      <SettingsState loading availabilityLoading />
      <SettingsState error />
    </div>
  ),
};
