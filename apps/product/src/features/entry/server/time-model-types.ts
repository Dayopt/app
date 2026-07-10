import type { Insert, Row, Update } from '@/lib/database';
import type {
  ConfirmDayInput,
  CreateLogInput,
  CreatePlanInput,
  LogFilter,
  PlanFilter,
  UpdateLogInput,
  UpdatePlanInput,
} from '../schemas/time-model';

export type PlanRow = Row<'plans'>;
export type PlanInsert = Insert<'plans'>;
export type PlanUpdate = Update<'plans'>;

export type LogRow = Row<'logs'>;
export type LogInsert = Insert<'logs'>;
export type LogUpdate = Update<'logs'>;

export interface ListPlansOptions extends PlanFilter {
  userId: string;
}

export interface GetPlanByIdOptions {
  userId: string;
  planId: string;
}

export interface CreatePlanOptions {
  userId: string;
  input: CreatePlanInput;
  preventOverlappingPlans?: boolean;
}

export interface UpdatePlanOptions {
  userId: string;
  planId: string;
  input: UpdatePlanInput;
  expectedUpdatedAt?: string | undefined;
  preventOverlappingPlans?: boolean;
}

export interface DeletePlanOptions {
  userId: string;
  planId: string;
}

export interface RecordPlanOptions {
  userId: string;
  planId: string;
}

export interface ConfirmDayPlansOptions {
  userId: string;
  input: ConfirmDayInput;
}

export interface ListLogsOptions extends LogFilter {
  userId: string;
}

export interface GetLogByIdOptions {
  userId: string;
  logId: string;
}

export interface CreateLogOptions {
  userId: string;
  input: CreateLogInput;
  preventOverlappingLogs?: boolean;
}

export interface UpdateLogOptions {
  userId: string;
  logId: string;
  input: UpdateLogInput;
  expectedUpdatedAt?: string | undefined;
  preventOverlappingLogs?: boolean;
}

export interface DeleteLogOptions {
  userId: string;
  logId: string;
}
