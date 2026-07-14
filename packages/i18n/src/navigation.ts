import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/** locale prefix を処理する product / web 共通 navigation API。 */
export const { Link, getPathname, redirect, usePathname, useRouter } = createNavigation(routing);
