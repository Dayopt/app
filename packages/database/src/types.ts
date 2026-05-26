import type { Database } from './generated/database.types';

export type TableName = keyof Database['public']['Tables'];

export type Row<TTable extends TableName> = Database['public']['Tables'][TTable]['Row'];

export type Insert<TTable extends TableName> = Database['public']['Tables'][TTable]['Insert'];

export type Update<TTable extends TableName> = Database['public']['Tables'][TTable]['Update'];
