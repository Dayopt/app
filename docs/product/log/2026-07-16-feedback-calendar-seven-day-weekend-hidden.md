---
status: frozen
date: 2026-07-16
code:
  - apps/product/src/features/calendar/components/layout/Header/ViewSwitcher.tsx
  - apps/product/src/features/calendar/components/controller/components/CalendarViewRenderer.tsx
  - apps/product/src/features/calendar/domain/view-range.ts
---

# 7日表示で週末を除いても7営業日を表示したい

## 原文

> calendarの週末を表示しないけど、6日以上表示する場合は、月から次の月曜まで見れる認識なんだけど違う？

> そうそう。実装の形はそれでok.中央から基準にってことね。でもそうなってないよ。7日でも5日文歯科表示されてない

## 反映

- `7日`の選択先を週境界基準の`week`ではなく、中央日基準の`7day`にする
- Multi-Dayはタブレットでも選択した表示日数を維持する
- 週末非表示のMulti-Dayは、選択日数と同数の営業日を表示する
- `week`は別viewとして明示し、週末非表示時は月曜から金曜を表示する
