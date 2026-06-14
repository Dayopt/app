/** Entry mutations public composition hook. */
import { useCreateEntryMutation } from './mutations/useCreateEntryMutation';
import { useEntryBulkMutations } from './mutations/useEntryBulkMutations';
import { useEntryConversionMutations } from './mutations/useEntryConversionMutations';
import { useEntryDeleteMutations } from './mutations/useEntryDeleteMutations';
import { useEntryMutationContext } from './mutations/useEntryMutationContext';
import { useEntrySkipMutations } from './mutations/useEntrySkipMutations';
import { useUpdateEntryMutation } from './mutations/useUpdateEntryMutation';

export function useEntryMutations(options?: {
  suppressCreateToast?: boolean;
  suppressUpdateErrorToast?: () => boolean;
}) {
  const context = useEntryMutationContext();
  const { skipEntry, unskipEntry } = useEntrySkipMutations(context);
  const createEntry = useCreateEntryMutation(context, {
    suppressCreateToast: options?.suppressCreateToast ?? false,
    skipEntry,
  });
  const updateEntry = useUpdateEntryMutation(context, options?.suppressUpdateErrorToast);
  const { convertPlannedToUnplanned, convertUnplannedToPlanned } =
    useEntryConversionMutations(context);
  const { restoreEntry, deleteEntry } = useEntryDeleteMutations(context);
  const { bulkUpdateEntries, bulkDeleteEntries, bulkAddTags } = useEntryBulkMutations(context);
  return {
    createEntry,
    updateEntry,
    convertPlannedToUnplanned,
    convertUnplannedToPlanned,
    skipEntry,
    unskipEntry,
    restoreEntry,
    deleteEntry,
    bulkUpdateEntries,
    bulkDeleteEntries,
    bulkAddTags,
  };
}
