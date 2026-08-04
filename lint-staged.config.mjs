import path from 'node:path';

const quote = (value) => JSON.stringify(value);

const toPosixPath = (value) => value.split(path.sep).join(path.posix.sep);

const relativeToRoot = (files) =>
  files.map((file) => toPosixPath(path.relative(process.cwd(), file)));

const relativeToWorkspace = (files, workspace) =>
  files
    .filter((file) => toPosixPath(path.relative(process.cwd(), file)).startsWith(`${workspace}/`))
    .map((file) => toPosixPath(path.relative(path.join(process.cwd(), workspace), file)));

export default {
  '*.{ts,tsx,js,jsx}': (files) => {
    const rootFiles = relativeToRoot(files);
    const productFiles = relativeToWorkspace(files, 'apps/product');
    const webFiles = relativeToWorkspace(files, 'apps/web');

    return [
      `prettier --write ${rootFiles.map(quote).join(' ')}`,
      ...(productFiles.length > 0
        ? [`pnpm --dir apps/product exec eslint --fix ${productFiles.map(quote).join(' ')}`]
        : []),
      ...(webFiles.length > 0
        ? [`pnpm --dir apps/web exec eslint --fix ${webFiles.map(quote).join(' ')}`]
        : []),
    ];
  },
  '*.{json,md,yml,yaml,css,mdx}': (files) =>
    `prettier --write ${relativeToRoot(files).map(quote).join(' ')}`,
};
