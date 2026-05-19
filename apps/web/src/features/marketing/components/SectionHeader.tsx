import type { ReactNode } from 'react';

interface SectionHeaderProps {
  /** バッジアイコン（20px SVG） */
  icon: ReactNode;
  /** バッジラベル */
  label: string;
  /** バッジ/アイコンのカラークラス（例: "text-primary"） */
  color?: string;
  /** ヘッドライン */
  headline: React.ReactNode;
  /** サブタイトル */
  subtitle: string;
}

export function SectionHeader({
  icon,
  label,
  color = 'text-primary',
  headline,
  subtitle,
}: SectionHeaderProps) {
  return (
    <div className="mx-auto mb-12 text-center sm:mb-[80px]">
      {/* Badge */}
      <div className={`mb-5 inline-flex items-center gap-2 ${color}`}>
        <span className="flex size-6 items-center justify-center">{icon}</span>
        <span className="text-2xl font-medium">{label}</span>
      </div>

      {/* Headline */}
      <h2 className="text-foreground text-6xl leading-[1.1] font-medium tracking-[-0.035em]">
        {headline}
      </h2>

      {/* Subtitle */}
      <p className="text-muted-foreground mx-auto mt-4 text-xl" style={{ maxWidth: 480 }}>
        {subtitle}
      </p>
    </div>
  );
}
