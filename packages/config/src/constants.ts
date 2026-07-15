export const dayoptDomains = {
  marketing: 'dayopt.app',
  product: 'app.dayopt.app',
  mcp: 'mcp.dayopt.app',
  docs: 'docs.dayopt.app',
  www: 'www.dayopt.app',
} as const;

export const dayoptUrls = {
  marketing: `https://${dayoptDomains.marketing}`,
  product: `https://${dayoptDomains.product}`,
  mcp: `https://${dayoptDomains.mcp}`,
  docs: `https://${dayoptDomains.docs}`,
  www: `https://${dayoptDomains.www}`,
} as const;

export const dayoptContact = {
  supportEmail: 'support@dayopt.app',
  securityEmail: 'security@dayopt.app',
  contactEmail: 'contact@dayopt.app',
} as const;

export const dayoptBrand = {
  name: 'Dayopt',
  teamName: 'Dayopt Team',
  platformName: 'Dayopt Platform',
  twitterHandle: '@dayoptapp',
  xUrl: 'https://x.com/dayoptapp',
  githubUrl: 'https://github.com/dayoptapp',
  githubRepositoryUrl: 'https://github.com/Dayopt/dayopt',
  githubIssuesNewUrl: 'https://github.com/Dayopt/dayopt/issues/new',
  youtubeUrl: 'https://youtube.com/@dayoptapp',
} as const;

export type DayoptUrlBase = string;

export function createDayoptUrl(base: DayoptUrlBase, path = ''): string {
  if (!path || path === '/') return base;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export const dayoptProductUrls = {
  signup: createDayoptUrl(dayoptUrls.product, '/auth/signup'),
} as const;
