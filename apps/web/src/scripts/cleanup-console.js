#!/usr/bin/env node

/**
 * Console cleanup script for removing console statements from production code
 * This script removes console.log, console.warn, and other debug statements
 */

const fs = require('fs');
const path = require('path');

// Patterns to remove for production
const consolePatterns = [
  /console\.log\([^)]*\);?\s*\n?/g,
  /console\.warn\([^)]*\);?\s*\n?/g,
  /console\.error\([^)]*\);?\s*\n?/g,
  /console\.info\([^)]*\);?\s*\n?/g,
  /console\.debug\([^)]*\);?\s*\n?/g,
  /console\.trace\([^)]*\);?\s*\n?/g,
];

// Files to exclude from cleanup
const excludePatterns = [
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  // Keep console statements in these specific files
  'src/scripts/',
  'src/lib/logger.ts',
  'src/lib/error-handler.ts',
  'src/lib/accessibility.ts',
  'src/lib/performance.ts',
  'src/lib/analytics.ts',
  'src/lib/search-console.ts',
  'src/app/api/errors/route.ts',
  'src/components/analytics/WebVitals.tsx',
];

function shouldExcludeFile(filePath) {
  return excludePatterns.some((pattern) => filePath.includes(pattern));
}

function cleanupConsoleStatements(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let cleanedContent = content;
    let removedCount = 0;

    // Apply all console patterns
    consolePatterns.forEach((pattern) => {
      const matches = cleanedContent.match(pattern);
      if (matches) {
        removedCount += matches.length;
        cleanedContent = cleanedContent.replace(pattern, '');
      }
    });

    // Only write if changes were made
    if (removedCount > 0) {
      fs.writeFileSync(filePath, cleanedContent);
      console.log(
        `✅ Cleaned ${removedCount} console statement(s) from ${path.relative(process.cwd(), filePath)}`,
      );
    }

    return removedCount;
  } catch (error) {
    console.error(`❌ Error cleaning ${filePath}: ${error.message}`);
    return 0;
  }
}

function cleanupDirectory(dir) {
  let totalRemoved = 0;

  try {
    const items = fs.readdirSync(dir);

    items.forEach((item) => {
      const fullPath = path.join(dir, item);

      if (shouldExcludeFile(fullPath)) {
        return;
      }

      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        totalRemoved += cleanupDirectory(fullPath);
      } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(item)) {
        totalRemoved += cleanupConsoleStatements(fullPath);
      }
    });
  } catch (error) {
    console.error(`❌ Error reading directory ${dir}: ${error.message}`);
  }

  return totalRemoved;
}

function runConsoleCleanup() {
  console.log('🧹 Running Console Cleanup...\n');

  const srcDir = path.join(process.cwd(), 'src');

  if (!fs.existsSync(srcDir)) {
    console.log('❌ src directory not found');
    return;
  }

  const totalRemoved = cleanupDirectory(srcDir);

  console.log('\n📊 Cleanup Results');
  console.log('='.repeat(30));

  if (totalRemoved === 0) {
    console.log('✅ No console statements found to remove');
  } else {
    console.log(`🎉 Successfully removed ${totalRemoved} console statement(s)`);
    console.log('💡 Your code is now production-ready!');
  }

  console.log('\n✨ Cleanup complete!');
}

// Run cleanup if this script is executed directly
if (require.main === module) {
  runConsoleCleanup();
}

module.exports = { runConsoleCleanup };
