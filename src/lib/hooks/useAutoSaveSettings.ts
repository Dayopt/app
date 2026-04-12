import { useCallback, useRef, useState } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { getErrorMessage } from '@/lib/errors';
import { useDebouncedCallback } from '@/lib/hooks/useDebounce';
import { logger } from '@/lib/logger';

interface UseAutoSaveSettingsOptions<T> {
  initialValues: T;
  onSave: (values: T) => Promise<void>;
  debounceMs?: number;
  successMessage?: string;
  errorMessage?: string;
}

/**
 * 設定値の変更を検知してデバウンス付きで自動保存するフック
 * @returns values（現在の値）、updateValue（単一フィールド更新）、updateValues（複数フィールド更新）、isSaving（保存中フラグ）
 */
export function useAutoSaveSettings<T>({
  initialValues,
  onSave,
  debounceMs = 1000,
  successMessage,
  errorMessage,
}: UseAutoSaveSettingsOptions<T>) {
  const t = useTranslations();
  const [values, setValues] = useState<T>(initialValues);
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedValues = useRef<T>(initialValues);

  const debouncedSave = useDebouncedCallback(async (newValues: T) => {
    if (JSON.stringify(newValues) === JSON.stringify(lastSavedValues.current)) {
      return;
    }

    setIsSaving(true);

    try {
      await onSave(newValues);
      lastSavedValues.current = newValues;
      toast.success(successMessage ?? t('settings.common.saved'));
    } catch (error) {
      logger.error('Failed to save settings:', error);
      toast.error(errorMessage ?? t('settings.common.saveFailed'), {
        description: getErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  }, debounceMs);

  const prevValuesRef = useRef<T>(initialValues);
  if (JSON.stringify(values) !== JSON.stringify(prevValuesRef.current)) {
    prevValuesRef.current = values;
    debouncedSave(values);
  }

  const updateValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateValues = useCallback((updates: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...updates }));
  }, []);

  return {
    values,
    updateValue,
    updateValues,
    isSaving,
  };
}
