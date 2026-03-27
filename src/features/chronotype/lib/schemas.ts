import { z } from 'zod';

/** クロノタイプ種別のZodスキーマ */
export const chronotypeTypeSchema = z.enum(['lion', 'bear', 'wolf', 'dolphin', 'custom']);

/** 生産性レベルのZodスキーマ */
export const chronotypeLevelSchema = z.enum(['warmup', 'deep', 'ease', 'recovery', 'winddown']);

/** 生産性ゾーン（時間帯×レベル）のZodスキーマ */
export const productivityZoneSchema = z.object({
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  level: chronotypeLevelSchema,
  label: z.string().max(100),
});

/** カスタムクロノタイプのゾーン配列スキーマ（最大24ゾーン） */
export const chronotypeCustomZonesSchema = z.array(productivityZoneSchema).max(24);
