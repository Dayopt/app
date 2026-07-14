import { assertPlaygroundAccess } from '@/lib/dev/assert-playground-access';

import { DndTagsPlayground } from './DndTagsPlayground';

export default function Page() {
  assertPlaygroundAccess();

  return <DndTagsPlayground />;
}
