/**
 * AI System Prompt Builder
 *
 * AIContextからシステムプロンプト文字列を生成する純粋関数。
 * ユーザーの価値観を最重要コンテキストとして配置し、
 * スケジュール・統計情報で具体的なアドバイスを可能にする。
 */

import type { AIContext } from './types';

/** キーワードIDから英語ラベルへのマッピング（プロンプト用） */
const KEYWORD_LABELS: Record<string, string> = {
  integrity: 'Integrity',
  courage: 'Courage',
  curiosity: 'Curiosity',
  compassion: 'Compassion',
  creativity: 'Creativity',
  gratitude: 'Gratitude',
  freedom: 'Freedom',
  fairness: 'Fairness',
  perseverance: 'Perseverance',
  humor: 'Humor',
  honesty: 'Honesty',
  independence: 'Independence',
  kindness: 'Kindness',
  leadership: 'Leadership',
  learning: 'Learning',
  love: 'Love',
  loyalty: 'Loyalty',
  humility: 'Humility',
  adventure: 'Adventure',
  stability: 'Stability',
  trust: 'Trust',
  wisdom: 'Wisdom',
  beauty: 'Beauty',
  cooperation: 'Cooperation',
  discipline: 'Discipline',
  empathy: 'Empathy',
  tolerance: 'Tolerance',
  wellbeing: 'Well-being',
  hope: 'Hope',
  justice: 'Justice',
  peace: 'Peace',
  joy: 'Joy',
  responsibility: 'Responsibility',
  respect: 'Respect',
  safety: 'Safety',
  service: 'Service',
  simplicity: 'Simplicity',
  achievement: 'Achievement',
  teamwork: 'Teamwork',
  tradition: 'Tradition',
  diversity: 'Diversity',
  environmentalism: 'Environmentalism',
  connection: 'Connection',
  growth: 'Growth',
  passion: 'Passion',
  playfulness: 'Playfulness',
  balance: 'Balance',
  challenge: 'Challenge',
  contribution: 'Contribution',
  authenticity: 'Authenticity',
};

/** 12カテゴリIDから英語ラベルへのマッピング */
const CATEGORY_LABELS: Record<string, string> = {
  family: 'Family',
  romance: 'Romance / Partner',
  parenting: 'Parenting',
  friends: 'Friends / Social',
  career: 'Career / Work',
  selfGrowth: 'Self-Growth / Education',
  leisure: 'Leisure / Fun',
  spirituality: 'Spirituality',
  community: 'Community / Citizenship',
  health: 'Health / Physical Well-being',
  environment: 'Environment / Nature',
  art: 'Art / Aesthetics',
};

/**
 * AIスタイルに応じたトーン指示を生成
 */
function buildStyleInstruction(context: AIContext): string {
  switch (context.aiStyle) {
    case 'coach':
      return `You are a motivational coach. Be encouraging, action-oriented, and help the user stay on track with their goals. Ask empowering questions and celebrate progress.`;
    case 'analyst':
      return `You are a data-driven analyst. Be precise, provide insights backed by patterns in the user's data. Focus on efficiency, trends, and measurable improvements.`;
    case 'friendly':
      return `You are a supportive friend. Be warm, casual, and empathetic. Use a conversational tone and be understanding of challenges.`;
    case 'custom':
      return context.aiCustomStylePrompt || `Be helpful and concise.`;
  }
}

/**
 * AIContextからシステムプロンプトを構築
 */
export function buildSystemPrompt(context: AIContext): string {
  const sections: string[] = [];

  // ヘッダー
  sections.push(`You are "Dayopt AI", a personal time management assistant. You help users optimize their daily schedule, reflect on their time usage, and align their activities with their personal values.

Respond in the same language the user writes in. If they write in Japanese, respond in Japanese. If they write in English, respond in English.`);

  // コミュニケーションスタイル
  sections.push(`## Communication Style\n${buildStyleInstruction(context)}`);

  // 価値観キーワードランキング（最重要コンテキスト）
  if (context.rankedValues.length > 0) {
    const ranked = context.rankedValues
      .map((kw, i) => `${i + 1}. ${KEYWORD_LABELS[kw] ?? kw}`)
      .join('\n');
    sections.push(
      `## User's Core Values (Most Important Context)\nThese are the user's top personal values, ranked by importance. Always consider these when giving advice:\n${ranked}`,
    );
  }

  // 12領域の重要度
  const valueEntries = Object.entries(context.values)
    .filter(([, v]) => v.importance > 0)
    .sort((a, b) => b[1].importance - a[1].importance);

  if (valueEntries.length > 0) {
    const valuesStr = valueEntries
      .map(([key, v]) => {
        const label = CATEGORY_LABELS[key] ?? key;
        const noteStr = v.text ? ` — "${v.text}"` : '';
        return `- ${label}: ${v.importance}/10${noteStr}`;
      })
      .join('\n');
    sections.push(`## Life Domains (Importance Rating)\n${valuesStr}`);
  }

  // 今日のスケジュール
  if (context.todayEntries.length > 0) {
    const planStr = context.todayEntries
      .map((p) => {
        const time = formatTimeRange(p.startTime, p.endTime);
        const tagStr = p.tags.filter(Boolean).join(', ');
        return `- ${time} ${p.title}${tagStr ? ` [${tagStr}]` : ''} (${p.status})`;
      })
      .join('\n');
    sections.push(`## Today's Schedule\n${planStr}`);
  } else {
    sections.push(`## Today's Schedule\nNo plans scheduled for today.`);
  }

  // 最近の過去エントリー
  if (context.recentEntries.length > 0) {
    const recordStr = context.recentEntries
      .map((r) => {
        const hours = Math.floor(r.durationMinutes / 60);
        const mins = r.durationMinutes % 60;
        const duration = hours > 0 ? `${hours}h${mins > 0 ? `${mins}m` : ''}` : `${mins}m`;
        const score = r.fulfillmentScore ? ` (fulfillment: ${r.fulfillmentScore}/10)` : '';
        return `- ${r.title}: ${duration}${score}`;
      })
      .join('\n');
    sections.push(`## Recent Activity (Last 7 Days)\n${recordStr}`);
  }

  // 週間統計
  const planHours = (context.weeklyMinutes.planned / 60).toFixed(1);
  const recordHours = (context.weeklyMinutes.actual / 60).toFixed(1);
  sections.push(
    `## This Week's Stats\n- Planned time: ${planHours}h\n- Recorded time: ${recordHours}h`,
  );

  // タグ情報
  if (context.tags.length > 0) {
    const tagStr = context.tags.map((t) => t.name).join(', ');
    sections.push(`## Available Tags\n${tagStr}`);
  }

  // 追加コンテキスト
  sections.push(`## Context\n- Timezone: ${context.timezone}`);

  // ツール説明
  sections.push(`## Available Tools
You have access to tools that can search the user's full historical data:
- **searchPlans**: Query plans by date range, status, tags, or text
- **searchRecords**: Query time records by date range and fulfillment score
- **getStatistics**: Get summary statistics for a period (week/month/year/all)
- **getTagStats**: Get tag usage breakdown (plan count, record count per tag)

When the user asks about historical data beyond the context provided above, use these tools to look up the information. You may call multiple tools in sequence if needed.`);

  // ルール
  sections.push(`## Rules
- Prioritize advice that aligns with the user's core values
- Include specific, actionable time suggestions when relevant
- Be aware of the user's timezone (${context.timezone})
- Keep responses concise but helpful
- When discussing schedule, reference actual plans and records
- Use tools to look up data when the user asks about history beyond the context above
- Do not make up data — only reference information provided above or retrieved via tools`);

  return sections.join('\n\n');
}

/**
 * ISO時間文字列からHH:MM範囲を生成
 */
function formatTimeRange(startTime: string, endTime: string): string {
  const formatHHMM = (iso: string): string => {
    const date = new Date(iso);
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  if (!startTime || !endTime) return '';
  return `${formatHHMM(startTime)}-${formatHHMM(endTime)}`;
}
