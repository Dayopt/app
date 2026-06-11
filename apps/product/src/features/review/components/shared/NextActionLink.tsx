'use client';

import { ArrowRight } from 'lucide-react';

import Link from 'next/link';

import { Button } from '@/lib/components/ui/button';

/**
 * NextActionLink — Review から次の計画（Calendar）への還流導線
 *
 * Plan → Track → Review → Improve のループを閉じる Tier 2 行動 CTA。
 * 1 ビューに 1 つまで（copywriting.md の CTA 階層に従う）。
 */
export function NextActionLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex justify-end">
      <Button variant="outline" asChild>
        <Link href={href}>
          {label}
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
