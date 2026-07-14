import { assertPlaygroundAccess } from '@/lib/dev/assert-playground-access';

import { MultiContainerPlayground } from './MultiContainerPlayground';

export default function Page() {
  assertPlaygroundAccess();

  return <MultiContainerPlayground />;
}
