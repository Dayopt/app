/**
 * Realtime接続状態ストア
 *
 * Supabase Realtimeの接続状態を管理し、UIから参照可能にする。
 * リトライ上限超過時の通知や、再接続時のgap fill発火に使用。
 */

import { create } from 'zustand';

type RealtimeConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface RealtimeConnectionState {
  status: RealtimeConnectionStatus;
  setStatus: (status: RealtimeConnectionStatus) => void;
}

/** Supabase Realtime接続状態を管理するZustandストア */
export const useRealtimeConnectionStore = create<RealtimeConnectionState>((set) => ({
  status: 'connected',
  setStatus: (status) => set({ status }),
}));
