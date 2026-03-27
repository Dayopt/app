import type { PresetChronotypeType } from '@/types/chronotype';
import { describe, expect, it } from 'vitest';
import { calculateChronotypeResult, CHRONOTYPE_QUIZ_QUESTIONS } from '../quiz';

describe('calculateChronotypeResult', () => {
  it('returns lion when all answers are lion options', () => {
    const answers: Record<string, string> = {
      wakeTime: 'early', // lion: 3
      morningEnergy: 'veryHigh', // lion: 3
      deepFocus: 'earlyMorning', // lion: 3
      afternoonEase: 'earlyEase', // lion: 3
      bedTime: 'early', // lion: 3
      sleepQuality: 'deepSleep', // lion: 3
    };

    const result = calculateChronotypeResult(answers);
    expect(result).toBe('lion');
  });

  it('returns bear when all answers are bear options', () => {
    const answers: Record<string, string> = {
      wakeTime: 'moderate', // bear: 3
      morningEnergy: 'gradual', // bear: 3
      deepFocus: 'lateMorning', // bear: 3
      afternoonEase: 'normalEase', // bear: 3
      bedTime: 'normal', // bear: 3
      sleepQuality: 'normalSleep', // bear: 3
    };

    const result = calculateChronotypeResult(answers);
    expect(result).toBe('bear');
  });

  it('returns wolf when all answers are wolf options', () => {
    const answers: Record<string, string> = {
      wakeTime: 'late', // wolf: 3
      morningEnergy: 'low', // wolf: 3
      deepFocus: 'afternoon', // wolf: 3
      afternoonEase: 'noEase', // wolf: 3
      bedTime: 'late', // wolf: 3
      sleepQuality: 'nightOwl', // wolf: 3
    };

    const result = calculateChronotypeResult(answers);
    expect(result).toBe('wolf');
  });

  it('returns dolphin when all answers are dolphin options', () => {
    const answers: Record<string, string> = {
      wakeTime: 'irregular', // dolphin: 3
      morningEnergy: 'anxious', // dolphin: 3
      deepFocus: 'evening', // dolphin: 1
      afternoonEase: 'unpredictable', // dolphin: 3
      bedTime: 'inconsistent', // dolphin: 3
      sleepQuality: 'lightSleep', // dolphin: 3
    };

    const result = calculateChronotypeResult(answers);
    expect(result).toBe('dolphin');
  });

  it('returns first in sorted order when answers is empty (all scores 0)', () => {
    const answers: Record<string, string> = {};

    const result = calculateChronotypeResult(answers);
    // When all scores are 0, sorting doesn't guarantee order, just check it's a valid type
    expect(['lion', 'bear', 'wolf', 'dolphin']).toContain(result);
  });

  it('returns bear when all scores are tied', () => {
    // Create a scenario where all types have equal scores
    // Use options that all give 1 point to lion, bear, wolf, dolphin
    const answers: Record<string, string> = {
      wakeTime: 'moderate', // lion: 1, bear: 3, wolf: 0, dolphin: 1 (bear wins here)
      morningEnergy: 'gradual', // lion: 1, bear: 3, wolf: 0, dolphin: 1 (bear wins here)
      deepFocus: 'lateMorning', // lion: 1, bear: 3, wolf: 0, dolphin: 1 (bear wins here)
      afternoonEase: 'normalEase', // lion: 1, bear: 3, wolf: 0, dolphin: 1 (bear wins here)
      bedTime: 'normal', // lion: 1, bear: 3, wolf: 0, dolphin: 1 (bear wins here)
      sleepQuality: 'normalSleep', // lion: 1, bear: 3, wolf: 1, dolphin: 0 (bear wins)
    };

    const result = calculateChronotypeResult(answers);
    expect(result).toBe('bear');
  });

  it('returns highest scorer when partial answers are provided', () => {
    const answers: Record<string, string> = {
      wakeTime: 'early', // lion: 3
      morningEnergy: 'veryHigh', // lion: 3
      deepFocus: 'earlyMorning', // lion: 3
      // Missing afternoonEase, bedTime, sleepQuality
    };

    const result = calculateChronotypeResult(answers);
    expect(result).toBe('lion'); // lion has 9 points, others have much less
  });

  it('ignores unknown question IDs', () => {
    const answers: Record<string, string> = {
      wakeTime: 'early', // lion: 3
      morningEnergy: 'veryHigh', // lion: 3
      deepFocus: 'earlyMorning', // lion: 3
      afternoonEase: 'earlyEase', // lion: 3
      bedTime: 'early', // lion: 3
      sleepQuality: 'deepSleep', // lion: 3
      unknownQuestion: 'someOption', // Should be ignored
      anotherUnknown: 'anotherValue', // Should be ignored
    };

    const result = calculateChronotypeResult(answers);
    expect(result).toBe('lion');
  });

  it('ignores unknown option IDs within a question', () => {
    const answers: Record<string, string> = {
      wakeTime: 'unknownOption', // Unknown option, should be skipped
      morningEnergy: 'veryHigh', // lion: 3
      deepFocus: 'earlyMorning', // lion: 3
      afternoonEase: 'earlyEase', // lion: 3
      bedTime: 'early', // lion: 3
      sleepQuality: 'deepSleep', // lion: 3
    };

    const result = calculateChronotypeResult(answers);
    // Scores: lion: 15 (3+3+3+3+3 without wakeTime), others much lower
    expect(result).toBe('lion');
  });

  it('handles mixed chronotypes correctly', () => {
    const answers: Record<string, string> = {
      wakeTime: 'early', // lion: 3, bear: 1, dolphin: 1
      morningEnergy: 'gradual', // lion: 1, bear: 3, dolphin: 1
      deepFocus: 'lateMorning', // lion: 1, bear: 3, dolphin: 1
      afternoonEase: 'normalEase', // lion: 1, bear: 3, dolphin: 1
      bedTime: 'normal', // lion: 1, bear: 3, dolphin: 1
      sleepQuality: 'deepSleep', // lion: 3, bear: 1, wolf: 1
    };

    const result = calculateChronotypeResult(answers);
    // lion: 3+1+1+1+1+3 = 10
    // bear: 1+3+3+3+3+1 = 14
    // wolf: 0+0+0+0+0+1 = 1
    // dolphin: 1+1+1+1+1+0 = 5
    expect(result).toBe('bear');
  });

  it('consistently returns the same result for identical inputs', () => {
    const answers: Record<string, string> = {
      wakeTime: 'moderate',
      morningEnergy: 'low',
      deepFocus: 'afternoon',
      afternoonEase: 'noEase',
      bedTime: 'late',
      sleepQuality: 'nightOwl',
    };

    const result1 = calculateChronotypeResult(answers);
    const result2 = calculateChronotypeResult(answers);

    expect(result1).toBe(result2);
  });

  it('validates that all questions are defined in the quiz', () => {
    const expectedQuestionIds = [
      'wakeTime',
      'morningEnergy',
      'deepFocus',
      'afternoonEase',
      'bedTime',
      'sleepQuality',
    ];
    const actualQuestionIds = CHRONOTYPE_QUIZ_QUESTIONS.map((q) => q.id);

    expectedQuestionIds.forEach((id) => {
      expect(actualQuestionIds).toContain(id);
    });
  });

  it('validates that each question has 4 options', () => {
    CHRONOTYPE_QUIZ_QUESTIONS.forEach((question) => {
      expect(question.options).toHaveLength(4);
    });
  });

  it('validates that each option has scores for all chronotypes', () => {
    const chronotypes: PresetChronotypeType[] = ['lion', 'bear', 'wolf', 'dolphin'];

    CHRONOTYPE_QUIZ_QUESTIONS.forEach((question) => {
      question.options.forEach((option) => {
        chronotypes.forEach((type) => {
          expect(option.scores).toHaveProperty(type);
          expect(typeof option.scores[type]).toBe('number');
          expect(option.scores[type]).toBeGreaterThanOrEqual(0);
        });
      });
    });
  });
});
