import { z } from 'zod';

/** クロノタイプ種別のZodスキーマ */
export const chronotypeTypeSchema = z.enum(['lion', 'bear', 'wolf', 'dolphin']);
