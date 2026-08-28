#!/usr/bin/env node
/**
 * CLAUDE.md / AGENTS.md Document Reference Validator
 *
 * Validates all file references in CLAUDE.md and AGENTS.md files to ensure they exist.
 * Part of Issue #582 Phase 4-1: Document Link Validation Automation
 *
 * #2479（AGENTS.md 一本化）以降、root CLAUDE.md は `@AGENTS.md` import のシムのみで
 * 実質のガイダンスは AGENTS.md 側にある。CLAUDE.md だけを検証すると AGENTS.md 内の
 * リンク切れを見逃すため、両方を対象にする。
 *
 * Usage: npx tsx scripts/tasks/validate-doc-references.ts
 *
 * Exit codes:
 *   0: All references valid
 *   1: Validation errors found
 */

import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface MarkdownLink {
  text: string;
  path: string;
  fullMatch: string;
}

interface ValidationResult {
  valid: boolean;
  type: 'external' | 'anchor' | 'file';
  resolvedPath?: string;
}

interface ValidationError {
  file: string;
  link: string;
  path: string;
  resolvedPath: string;
}

/**
 * Extract all markdown links from content
 * Matches: [text](path), [text](path "title")
 */
function extractMarkdownLinks(content: string): MarkdownLink[] {
  const linkRegex = /\[([^\]]+)\]\(([^)"\s]+)(?:\s+"[^"]*")?\)/g;
  const links: MarkdownLink[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      text: match[1],
      path: match[2],
      fullMatch: match[0],
    });
  }

  return links;
}

/**
 * Check if a file reference exists
 */
function validateFileReference(refPath: string, baseDir: string): ValidationResult {
  // Skip external URLs
  if (refPath.startsWith('http://') || refPath.startsWith('https://')) {
    return { valid: true, type: 'external' };
  }

  // Skip anchors
  if (refPath.startsWith('#')) {
    return { valid: true, type: 'anchor' };
  }

  // Remove anchor from path
  const pathWithoutAnchor = refPath.split('#')[0];

  // Resolve relative path
  const resolvedPath = path.resolve(baseDir, pathWithoutAnchor);

  // Check if file exists
  const exists = fs.existsSync(resolvedPath);

  return {
    valid: exists,
    type: 'file',
    resolvedPath,
  };
}

/**
 * Validate all references in a CLAUDE.md file
 */
function validateClaudeFile(filePath: string): ValidationError[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const baseDir = path.dirname(filePath);
  const links = extractMarkdownLinks(content);

  const errors: ValidationError[] = [];

  for (const link of links) {
    const result = validateFileReference(link.path, baseDir);

    if (!result.valid && result.type === 'file') {
      errors.push({
        file: filePath,
        link: link.fullMatch,
        path: link.path,
        resolvedPath: result.resolvedPath!,
      });
    }
  }

  return errors;
}

/**
 * Main validation function
 */
async function main(): Promise<void> {
  console.log(
    `${colors.cyan}📚 CLAUDE.md / AGENTS.md Document Reference Validator${colors.reset}\n`,
  );

  // Find all CLAUDE.md and AGENTS.md files
  const claudeFiles = await glob('**/{CLAUDE,AGENTS}.md', {
    cwd: ROOT_DIR,
    ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**'],
    absolute: true,
  });

  console.log(
    `${colors.blue}Found ${claudeFiles.length} CLAUDE.md / AGENTS.md files${colors.reset}\n`,
  );

  let totalErrors = 0;

  // Validate each file
  for (const file of claudeFiles) {
    const relativePath = path.relative(ROOT_DIR, file);
    const errors = validateClaudeFile(file);

    if (errors.length === 0) {
      console.log(`${colors.green}✓${colors.reset} ${relativePath}`);
    } else {
      console.log(`${colors.red}✗${colors.reset} ${relativePath}`);
      totalErrors += errors.length;

      for (const error of errors) {
        console.log(`  ${colors.red}Missing:${colors.reset} ${error.link}`);
        console.log(`  ${colors.yellow}Resolved to:${colors.reset} ${error.resolvedPath}`);
      }
      console.log();
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (totalErrors === 0) {
    console.log(`${colors.green}✅ All document references are valid!${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`${colors.red}❌ Found ${totalErrors} broken reference(s)${colors.reset}`);
    process.exit(1);
  }
}

main().catch((error: Error) => {
  console.error(`${colors.red}Error:${colors.reset}`, error.message);
  process.exit(1);
});
