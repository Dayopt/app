import type { Insert, PublicRecordRow, Row } from '@/lib/database';
import { databaseTables } from '@/lib/database';
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

export type RecordRow = PublicRecordRow;
export type RecordInsert = Pick<Insert<typeof databaseTables.records>, keyof PublicRecordRow>;

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
  expectedUpdatedAt: string;
  preventOverlappingPlans?: boolean;
}

export interface DeletePlanOptions {
  userId: string;
  planId: string;
  expectedUpdatedAt: string;
}

export interface RecordPlanOptions {
  userId: string;
  planId: string;
  expectedUpdatedAt: string;
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
  recordId: string;
}

export interface CreateRecordOptions {
  userId: string;
  input: CreateRecordInput;
  preventOverlappingRecords?: boolean;
}

export interface UpdateRecordOptions {
  userId: string;
  recordId: string;
  input: UpdateRecordInput;
  expectedUpdatedAt: string;
  preventOverlappingRecords?: boolean;
}

export interface DeleteRecordOptions {
  userId: string;
  recordId: string;
  expectedUpdatedAt: string;
}
