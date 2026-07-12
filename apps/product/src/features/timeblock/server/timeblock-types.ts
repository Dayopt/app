import type { Insert, Row, Update } from '@/lib/database';
import type {
  ConfirmDayInput,
  CreatePlanInput,
  CreateRecordInput,
  PlanFilter,
  RecordFilter,
  UpdatePlanInput,
  UpdateRecordInput,
} from '../schemas/timeblock';

export type PlanRow = Row<'plans'>;
export type PlanInsert = Insert<'plans'>;
export type PlanUpdate = Update<'plans'>;

export type RecordRow = Row<'logs'>;
export type RecordInsert = Insert<'logs'>;
export type RecordUpdate = Update<'logs'>;

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

export interface ListRecordsOptions extends RecordFilter {
  userId: string;
}

export interface GetRecordByIdOptions {
  userId: string;
  logId: string;
}

export interface CreateRecordOptions {
  userId: string;
  input: CreateRecordInput;
  preventOverlappingLogs?: boolean;
}

export interface UpdateRecordOptions {
  userId: string;
  logId: string;
  input: UpdateRecordInput;
  expectedUpdatedAt?: string | undefined;
  preventOverlappingLogs?: boolean;
}

export interface DeleteRecordOptions {
  userId: string;
  logId: string;
}
