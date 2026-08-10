'use client';

import { GoogleCalendarSettings } from '@/features/external-calendar';

import { ICalFeedSettings } from './ICalFeedSettings';
import { McpConnectionsSettings } from './McpConnectionsSettings';

/** 外部サービスの接続面を Settings が Composition Layer として束ねる。 */
export function IntegrationsSettings() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <GoogleCalendarSettings />
      <ICalFeedSettings />
      <McpConnectionsSettings />
    </div>
  );
}
