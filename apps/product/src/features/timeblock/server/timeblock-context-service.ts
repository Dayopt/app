import {
  createTimeblockContextClient,
  type TimeblockContextClient,
  type TimeblockContextMarker,
} from './timeblock-context-client';

class TimeblockContextService {
  constructor(private readonly contextClient: TimeblockContextClient) {}

  getMarker(userId: string): Promise<TimeblockContextMarker> {
    return this.contextClient.getMarker(userId);
  }

  async getRevision(userId: string): Promise<{ revision: string }> {
    const marker = await this.getMarker(userId);
    return { revision: marker.revision };
  }
}

export function createTimeblockContextService(): TimeblockContextService {
  return new TimeblockContextService(createTimeblockContextClient());
}
