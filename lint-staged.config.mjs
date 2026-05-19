import path from 'node:path';

const quote = (value) => JSON.stringify(value);

const relativeToRoot = (files) => files.map((file) => path.relative(process.cwd(), file));

const relativeToApp = (files) =>
  files
    .filter((file) => path.relative(process.cwd(), file).startsWith('apps/app/'))
    .map((file) => path.relative(path.join(process.cwd(), 'apps/app'), file));

export default {
  '*.{ts,tsx,js,jsx}': (files) => {
    const rootFiles = relativeToRoot(files);
    const appFiles = relativeToApp(files);

    return [
      `prettier --write ${rootFiles.map(quote).join(' ')}`,
      ...(appFiles.length > 0
        ? [`pnpm --dir apps/app exec eslint --fix ${appFiles.map(quote).join(' ')}`]
        : []),
    ];
  },
  '*.{json,md,yml,yaml,css,mdx}': (files) =>
    `prettier --write ${relativeToRoot(files).map(quote).join(' ')}`,
};
