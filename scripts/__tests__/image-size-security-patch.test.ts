import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const rootRequire = createRequire(resolve(process.cwd(), 'package.json'));
const storybookRequire = createRequire(rootRequire.resolve('@storybook/nextjs-vite/package.json'));
const imageSizeEntry = storybookRequire.resolve('image-size');
const imageSizeDistDirectory = dirname(imageSizeEntry);
const fixtureDirectory = mkdtempSync(join(tmpdir(), 'dayopt-image-size-security-'));

const terminationProbe = String.raw`
  const { pathToFileURL } = require('node:url');

  (async () => {
    const [entrypoint, moduleMode, operation, exportName, inputArgument] =
      process.argv.slice(1);
    let loadedModule;
    try {
      loadedModule =
        moduleMode === 'import'
          ? await import(pathToFileURL(entrypoint).href)
          : require(entrypoint);
    } catch (error) {
      console.error(error);
      process.exitCode = 2;
      return;
    }

    try {
      if (operation === 'buffer') {
        loadedModule.imageSize(Buffer.from(inputArgument, 'base64'));
      } else if (operation === 'file') {
        await loadedModule.imageSizeFromFile(inputArgument);
      } else {
        loadedModule[exportName].calculate(Buffer.from(inputArgument, 'base64'));
      }
    } catch {
      // Malformed files may be rejected; the security contract is prompt termination.
    }
    process.stdout.write('terminated');
  })();
`;

function makeIcnsWithZeroLengthEntry(): Buffer {
  const input = Buffer.alloc(16);
  input.write('icns', 0, 'ascii');
  input.writeUInt32BE(input.length, 4);
  input.write('ic07', 8, 'ascii');
  input.writeUInt32BE(0, 12);
  return input;
}

function makeJxlWithZeroLengthPartialStream(): Buffer {
  const input = Buffer.alloc(32);
  input.writeUInt32BE(12, 0);
  input.write('JXL ', 4, 'ascii');
  input.writeUInt32BE(12, 12);
  input.write('ftyp', 16, 'ascii');
  input.write('jxl ', 20, 'ascii');
  input.writeUInt32BE(0, 24);
  input.write('jxlp', 28, 'ascii');
  return input;
}

function makeHeifWithZeroLengthImageProperty(): Buffer {
  const input = Buffer.alloc(64);
  input.writeUInt32BE(16, 0);
  input.write('ftyp', 4, 'ascii');
  input.write('heic', 8, 'ascii');
  input.writeUInt32BE(48, 16);
  input.write('meta', 20, 'ascii');
  input.writeUInt32BE(36, 28);
  input.write('iprp', 32, 'ascii');
  input.writeUInt32BE(28, 36);
  input.write('ipco', 40, 'ascii');
  input.writeUInt32BE(0, 44);
  input.write('ispe', 48, 'ascii');
  input.writeUInt32BE(1, 56);
  input.writeUInt32BE(1, 60);
  return input;
}

const maliciousCases = [
  {
    format: 'ICNS',
    input: makeIcnsWithZeroLengthEntry(),
    typeExport: 'ICNS',
    typeFile: 'icns',
  },
  {
    format: 'JXL',
    input: makeJxlWithZeroLengthPartialStream(),
    typeExport: 'JXL',
    typeFile: 'jxl',
  },
  {
    format: 'HEIF',
    input: makeHeifWithZeroLengthImageProperty(),
    typeExport: 'HEIF',
    typeFile: 'heif',
  },
] as const;

const moduleVariants = [
  { extension: 'cjs', label: 'CommonJS', mode: 'require' },
  { extension: 'mjs', label: 'ESM', mode: 'import' },
] as const;

type ProbeTarget = {
  entrypoint: string;
  exportName?: string;
  inputArgument: string;
  moduleMode: 'import' | 'require';
  operation: 'buffer' | 'file' | 'type';
};

function expectPromptTermination({
  entrypoint,
  exportName = '',
  inputArgument,
  moduleMode,
  operation,
}: ProbeTarget): void {
  const result = spawnSync(
    process.execPath,
    ['-e', terminationProbe, entrypoint, moduleMode, operation, exportName, inputArgument],
    {
      encoding: 'utf8',
      timeout: 2000,
    },
  );

  expect(result.error?.message ?? '').not.toContain('ETIMEDOUT');
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toBe('terminated');
}

afterAll(() => {
  rmSync(fixtureDirectory, { force: true, recursive: true });
});

describe('image-size security patch', () => {
  for (const variant of moduleVariants) {
    describe(variant.label, () => {
      it.each(maliciousCases)('terminates via root entry for $format', ({ input }) => {
        expectPromptTermination({
          entrypoint: join(imageSizeDistDirectory, `index.${variant.extension}`),
          inputArgument: input.toString('base64'),
          moduleMode: variant.mode,
          operation: 'buffer',
        });
      });

      it.each(maliciousCases)('terminates via fromFile entry for $format', ({ format, input }) => {
        const fixturePath = join(fixtureDirectory, `${format.toLowerCase()}-zero-length.bin`);
        writeFileSync(fixturePath, input);

        expectPromptTermination({
          entrypoint: join(imageSizeDistDirectory, `fromFile.${variant.extension}`),
          inputArgument: fixturePath,
          moduleMode: variant.mode,
          operation: 'file',
        });
      });

      it.each(maliciousCases)(
        'terminates via type entry for $format',
        ({ input, typeExport, typeFile }) => {
          expectPromptTermination({
            entrypoint: join(imageSizeDistDirectory, 'types', `${typeFile}.${variant.extension}`),
            exportName: typeExport,
            inputArgument: input.toString('base64'),
            moduleMode: variant.mode,
            operation: 'type',
          });
        },
      );
    });
  }

  it('preserves valid image detection', () => {
    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const { imageSize } = storybookRequire(imageSizeEntry) as {
      imageSize: (input: Uint8Array) => { height: number; type: string; width: number };
    };

    expect(imageSize(validPng)).toMatchObject({ height: 1, type: 'png', width: 1 });
  });
});
