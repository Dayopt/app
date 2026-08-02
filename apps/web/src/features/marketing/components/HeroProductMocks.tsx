'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { LearnMock } from './mocks/LearnMock';
import { PlanMock } from './mocks/PlanMock';
import { TrackMock } from './mocks/TrackMock';

interface HeroProductMocksProps {
  labels: {
    plan: string;
    track: string;
    learn: string;
  };
}

const MOCKS = [
  { key: 'plan', component: PlanMock },
  { key: 'track', component: TrackMock },
  { key: 'learn', component: LearnMock },
] as const;

// ループ用: [Learn(clone), Plan, Track, Learn, Plan(clone)]
const LOOP_MOCKS = [
  { key: 'learn-clone-head', component: LearnMock },
  ...MOCKS,
  { key: 'plan-clone-tail', component: PlanMock },
];

const REAL_START = 1;
const REAL_COUNT = MOCKS.length;
export function HeroProductMocks({ labels }: HeroProductMocksProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isJumping = useRef(false);

  // 初期スクロール位置を最初の実カードに設定
  useEffect(() => {
    const container = scrollRef.current;
    const firstReal = cardRefs.current[REAL_START];
    if (container && firstReal) {
      container.scrollLeft = firstReal.offsetLeft - container.offsetLeft;
    }
  }, []);

  // スクロール終了時にクローンから実カードへ瞬間ジャンプ
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let timer: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      clearTimeout(timer);
      if (isJumping.current) return;

      timer = setTimeout(() => {
        const cards = cardRefs.current;
        const containerRect = container.getBoundingClientRect();
        const centerX = containerRect.left + containerRect.width / 2;

        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          if (!card) continue;
          const rect = card.getBoundingClientRect();
          const dist = Math.abs(rect.left + rect.width / 2 - centerX);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        }

        if (closestIdx === 0) {
          isJumping.current = true;
          const target = cards[REAL_START + REAL_COUNT - 1];
          if (target) {
            container.style.scrollBehavior = 'auto';
            container.scrollLeft = target.offsetLeft - container.offsetLeft;
            container.style.scrollBehavior = '';
          }
          setActiveIndex(REAL_COUNT - 1);
          requestAnimationFrame(() => {
            isJumping.current = false;
          });
        } else if (closestIdx === LOOP_MOCKS.length - 1) {
          isJumping.current = true;
          const target = cards[REAL_START];
          if (target) {
            container.style.scrollBehavior = 'auto';
            container.scrollLeft = target.offsetLeft - container.offsetLeft;
            container.style.scrollBehavior = '';
          }
          setActiveIndex(0);
          requestAnimationFrame(() => {
            isJumping.current = false;
          });
        } else {
          setActiveIndex(closestIdx - REAL_START);
        }
      }, 80);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToCard = useCallback((index: number) => {
    setActiveIndex(index);
    const card = cardRefs.current[REAL_START + index];
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, []);

  const labelKeys = ['plan', 'track', 'learn'] as const;

  return (
    <div>
      {/* Carousel */}
      <div
        ref={scrollRef}
        className="hero-carousel-scroll flex snap-x snap-mandatory gap-6 overflow-x-auto"
      >
        {LOOP_MOCKS.map((mock, i) => (
          <div
            key={mock.key}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="bg-card border-border-subtle hover:border-primary/30 w-full shrink-0 snap-center overflow-hidden rounded-2xl border transition-[border-color,box-shadow] duration-200 hover:shadow-[var(--shadow-card)]"
          >
            <div className="aspect-[4/3]">
              <mock.component />
            </div>
          </div>
        ))}
      </div>

      {/* Indicator */}
      <div className="mt-6 flex items-center justify-center gap-8">
        {labelKeys.map((key, i) => (
          <button
            key={key}
            type="button"
            onClick={() => scrollToCard(i)}
            className={`border-b-2 pb-1 text-sm font-medium transition-colors ${
              activeIndex === i
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            }`}
          >
            {labels[key]}
          </button>
        ))}
      </div>
    </div>
  );
}
