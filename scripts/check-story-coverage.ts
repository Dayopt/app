#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UI_DIR = path.resolve(__dirname, '../src/components/ui');

interface CoverageResult {
  component: string;
  hasStory: boolean;
}

function getComponentFiles(): string[] {
  return fs
    .readdirSync(UI_DIR)
    .filter(
      (f) =>
        f.endsWith('.tsx') &&
        !f.endsWith('.stories.tsx') &&
        f !== 'index.tsx' &&
        !f.startsWith('use-'),
    );
}

function checkCoverage(componentFiles: string[]): CoverageResult[] {
  return componentFiles.map((file) => {
    const base = file.replace(/\.tsx$/, '');
    const storyFile = path.join(UI_DIR, `${base}.stories.tsx`);
    return {
      component: file,
      hasStory: fs.existsSync(storyFile),
    };
  });
}

function main(): void {
  const componentFiles = getComponentFiles();
  const results = checkCoverage(componentFiles);

  const covered = results.filter((r) => r.hasStory);
  const missing = results.filter((r) => !r.hasStory);

  console.log(`\nStory Coverage: ${covered.length}/${results.length} components\n`);

  if (missing.length === 0) {
    console.log('All UI components have stories.');
  } else {
    console.log(`Missing stories (${missing.length}):`);
    for (const { component } of missing) {
      console.log(`  - ${component}`);
    }
  }

  process.exit(0);
}

main();
