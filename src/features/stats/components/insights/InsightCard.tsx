'use client';

import { ArrowRight, Lightbulb, MessageCircleQuestion } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type {
  InsightComparison,
  InsightFinding,
  InsightOutput,
  InsightSuggestion,
} from '../../types/insights.types';
import { SentimentBadge } from '../shared/SentimentBadge';

interface InsightCardProps {
  insight: InsightOutput;
  className?: string;
}

/**
 * InsightCard — LLM インサイトの表示カード
 *
 * findings（発見）+ suggestions（提案）+ question（問い）+ comparison（比較）
 * を1枚のカードにまとめて表示。
 */
export function InsightCard({ insight, className }: InsightCardProps) {
  return (
    <Card className={cn('gap-0 border-none py-0', className)}>
      <CardContent className="flex flex-col gap-4 p-4">
        {/* Title */}
        <h3 className="text-foreground text-lg font-semibold">{insight.title}</h3>

        {/* Comparison Badge */}
        {insight.comparison && <ComparisonBadge comparison={insight.comparison} />}

        {/* Findings */}
        <div className="flex flex-col gap-2">
          {insight.findings.map((finding, i) => (
            <FindingItem key={`${finding.category}-${i}`} finding={finding} />
          ))}
        </div>

        {/* Suggestions */}
        {insight.suggestions.length > 0 && (
          <div className="border-border flex flex-col gap-2 border-t pt-4">
            {insight.suggestions.map((suggestion, i) => (
              <SuggestionItem key={i} suggestion={suggestion} />
            ))}
          </div>
        )}

        {/* Question */}
        <div className="bg-muted flex items-start gap-2 rounded-lg p-4">
          <MessageCircleQuestion className="text-muted-foreground mt-1 size-4 shrink-0" />
          <p className="text-muted-foreground text-sm italic">{insight.question}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function FindingItem({ finding }: { finding: InsightFinding }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <SentimentBadge sentiment={finding.sentiment} />
        <span className="text-foreground text-sm font-medium">{finding.headline}</span>
      </div>
      <p className="text-muted-foreground pl-1 text-sm">{finding.detail}</p>
    </div>
  );
}

function SuggestionItem({ suggestion }: { suggestion: InsightSuggestion }) {
  return (
    <div className="flex items-start gap-2">
      <Lightbulb className="text-primary mt-1 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm">{suggestion.action}</p>
        <p className="text-muted-foreground text-xs">{suggestion.rationale}</p>
      </div>
    </div>
  );
}

const COMPARISON_STYLES: Record<InsightComparison['direction'], string> = {
  improving: 'text-success',
  declining: 'text-destructive',
  stable: 'text-muted-foreground',
};

function ComparisonBadge({ comparison }: { comparison: InsightComparison }) {
  return (
    <div className="flex items-center gap-1">
      <ArrowRight className={cn('size-3.5', COMPARISON_STYLES[comparison.direction])} />
      <span className={cn('text-sm font-medium', COMPARISON_STYLES[comparison.direction])}>
        {comparison.summary}
      </span>
    </div>
  );
}
