import { beforeEach, describe, expect, it } from 'vitest';

import { createInitialState } from '../machine/tourMachine';

import { useTourStore } from './useTourStore';

describe('useTourStore', () => {
  beforeEach(() => {
    useTourStore.setState({
      machine: createInitialState([], false),
    });
  });

  describe('初期状態', () => {
    it('ツアーは idle・未完了', () => {
      const { machine } = useTourStore.getState();
      expect(machine.status).toBe('idle');
      expect(machine.completed).toBe(false);
      expect(machine.stepIndex).toBe(0);
    });
  });

  describe('send START', () => {
    it('ツアーを開始する（active に遷移）', () => {
      useTourStore.getState().send({ type: 'START' });
      const { machine } = useTourStore.getState();
      expect(machine.status).toBe('active');
      expect(machine.stepIndex).toBe(0);
      // skipWhen でフィルタされたステップが入る
      expect(machine.steps.length).toBeGreaterThan(0);
    });

    it('完了済みの場合は開始しない', () => {
      useTourStore.setState({
        machine: createInitialState([], true),
      });
      useTourStore.getState().send({ type: 'START' });
      expect(useTourStore.getState().machine.status).toBe('completed');
    });
  });

  describe('send NEXT', () => {
    it('次のステップに進む', () => {
      useTourStore.getState().send({ type: 'START' });
      useTourStore.getState().send({ type: 'NEXT' });
      expect(useTourStore.getState().machine.stepIndex).toBe(1);
    });

    it('最後のステップの次へ進む（done 状態）', () => {
      useTourStore.getState().send({ type: 'START' });
      const { machine } = useTourStore.getState();
      // 全ステップを進める
      for (let i = 0; i < machine.steps.length; i++) {
        const current = useTourStore.getState().machine;
        if (current.status === 'before-enter') {
          const step = current.steps[current.stepIndex];
          if (step) {
            useTourStore.getState().send({
              type: 'BEFORE_ENTER_COMPLETE',
              stepId: step.id,
            });
          }
        }
        useTourStore.getState().send({ type: 'NEXT' });
      }
      expect(useTourStore.getState().machine.status).toBe('done');
    });
  });

  describe('send PREV', () => {
    it('前のステップに戻れる', () => {
      useTourStore.getState().send({ type: 'START' });
      useTourStore.getState().send({ type: 'NEXT' });
      expect(useTourStore.getState().machine.stepIndex).toBe(1);
      useTourStore.getState().send({ type: 'PREV' });
      expect(useTourStore.getState().machine.stepIndex).toBe(0);
    });

    it('最初のステップでは PREV は無視', () => {
      useTourStore.getState().send({ type: 'START' });
      useTourStore.getState().send({ type: 'PREV' });
      expect(useTourStore.getState().machine.stepIndex).toBe(0);
    });
  });

  describe('send SKIP', () => {
    it('ツアーをスキップして完了にする', () => {
      useTourStore.getState().send({ type: 'START' });
      useTourStore.getState().send({ type: 'SKIP' });
      const { machine } = useTourStore.getState();
      expect(machine.status).toBe('completed');
      expect(machine.completed).toBe(true);
    });
  });

  describe('send COMPLETE', () => {
    it('done 状態から完了にする', () => {
      useTourStore.getState().send({ type: 'START' });
      const { machine } = useTourStore.getState();
      // 全ステップを進めて done にする
      for (let i = 0; i < machine.steps.length; i++) {
        const current = useTourStore.getState().machine;
        if (current.status === 'before-enter') {
          const step = current.steps[current.stepIndex];
          if (step) {
            useTourStore.getState().send({
              type: 'BEFORE_ENTER_COMPLETE',
              stepId: step.id,
            });
          }
        }
        useTourStore.getState().send({ type: 'NEXT' });
      }
      expect(useTourStore.getState().machine.status).toBe('done');
      useTourStore.getState().send({ type: 'COMPLETE' });
      const final = useTourStore.getState().machine;
      expect(final.status).toBe('completed');
      expect(final.completed).toBe(true);
    });
  });

  describe('send RESET', () => {
    it('全状態をリセットする', () => {
      useTourStore.setState({
        machine: createInitialState([], true),
      });
      useTourStore.getState().send({ type: 'RESET' });
      const { machine } = useTourStore.getState();
      expect(machine.completed).toBe(false);
      expect(machine.status).toBe('idle');
      expect(machine.stepIndex).toBe(0);
    });
  });

  describe('createSelectors', () => {
    it('セレクタで個別の値を取得できる', () => {
      expect(useTourStore.use).toBeDefined();
      expect(typeof useTourStore.use.machine).toBe('function');
      expect(typeof useTourStore.use.send).toBe('function');
    });
  });
});
