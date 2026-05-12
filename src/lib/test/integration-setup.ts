import { vi } from 'vitest';

// server-only: テスト環境ではサーバーコンポーネント制約を無効化
vi.mock('server-only', () => ({}));
