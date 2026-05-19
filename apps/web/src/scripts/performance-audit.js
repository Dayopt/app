#!/usr/bin/env node

/**
 * Performance audit script for analyzing Core Web Vitals and optimization opportunities
 * This script analyzes the built application for performance issues
 */

const fs = require('fs');
const path = require('path');

// Performance metrics to check
const performanceChecks = {
  // Check bundle sizes
  analyzeBundleSizes: () => {
    const issues = [];
    const buildManifestPath = path.join(process.cwd(), '.next', 'build-manifest.json');

    if (!fs.existsSync(buildManifestPath)) {
      issues.push({
        type: 'bundle-analysis',
        message: 'Build manifest not found. Run "npm run build" first.',
        severity: 'error',
      });
      return issues;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));
      const pages = manifest.pages || {};

      Object.entries(pages).forEach(([page, bundles]) => {
        if (bundles.length > 5) {
          issues.push({
            type: 'bundle-analysis',
            message: `Page "${page}" has ${bundles.length} bundles - consider code splitting`,
            severity: 'warning',
            page,
          });
        }
      });
    } catch (error) {
      issues.push({
        type: 'bundle-analysis',
        message: `Error reading build manifest: ${error.message}`,
        severity: 'error',
      });
    }

    return issues;
  },

  // Check for large static assets
  checkStaticAssets: () => {
    const issues = [];
    const staticDir = path.join(process.cwd(), 'public');

    if (!fs.existsSync(staticDir)) {
      return issues;
    }

    const checkDirectory = (dir, relativePath = '') => {
      const items = fs.readdirSync(dir);

      items.forEach((item) => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        const itemPath = path.join(relativePath, item);

        if (stat.isDirectory()) {
          checkDirectory(fullPath, itemPath);
        } else if (stat.isFile()) {
          const sizeKB = stat.size / 1024;

          // Check for large images
          if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item)) {
            if (sizeKB > 500) {
              issues.push({
                type: 'large-asset',
                message: `Large image file: ${itemPath} (${Math.round(sizeKB)}KB)`,
                severity: 'warning',
                file: itemPath,
                size: Math.round(sizeKB),
              });
            }
          }

          // Check for large font files
          if (/\.(woff|woff2|ttf|otf)$/i.test(item)) {
            if (sizeKB > 200) {
              issues.push({
                type: 'large-asset',
                message: `Large font file: ${itemPath} (${Math.round(sizeKB)}KB)`,
                severity: 'warning',
                file: itemPath,
                size: Math.round(sizeKB),
              });
            }
          }

          // Check for any file over 1MB
          if (sizeKB > 1024) {
            issues.push({
              type: 'large-asset',
              message: `Very large file: ${itemPath} (${Math.round(sizeKB)}KB)`,
              severity: 'error',
              file: itemPath,
              size: Math.round(sizeKB),
            });
          }
        }
      });
    };

    checkDirectory(staticDir);
    return issues;
  },

  // Check for performance anti-patterns in code
  checkCodePatterns: () => {
    const issues = [];
    const srcDir = path.join(process.cwd(), 'src');

    if (!fs.existsSync(srcDir)) {
      return issues;
    }

    const checkFile = (filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(process.cwd(), filePath);

        // Check for useEffect without dependencies
        if (content.includes('useEffect(') && !content.includes('useCallback')) {
          const useEffectMatches = content.match(/useEffect\([^,]+\)/g);
          if (useEffectMatches && useEffectMatches.length > 0) {
            issues.push({
              type: 'performance-pattern',
              message: `Potential useEffect without proper dependencies in ${relativePath}`,
              severity: 'warning',
              file: relativePath,
            });
          }
        }

        // Check for inline styles
        if (content.includes('style={{')) {
          issues.push({
            type: 'performance-pattern',
            message: `Inline styles found in ${relativePath} - consider using CSS classes`,
            severity: 'info',
            file: relativePath,
          });
        }

        // Check for console.log in production code
        if (content.includes('console.log') || content.includes('console.warn')) {
          issues.push({
            type: 'performance-pattern',
            message: `Console statements found in ${relativePath} - remove for production`,
            severity: 'warning',
            file: relativePath,
          });
        }

        // Check for large imports
        const importMatches = content.match(/import\s+.*\s+from\s+['"][^'"]+['"]/g);
        if (importMatches) {
          importMatches.forEach((importLine) => {
            if (importLine.includes('lodash') && !importLine.includes('lodash/')) {
              issues.push({
                type: 'performance-pattern',
                message: `Full lodash import in ${relativePath} - use specific imports`,
                severity: 'warning',
                file: relativePath,
              });
            }
          });
        }
      } catch {
        // Ignore files that can't be read
      }
    };

    const traverseDirectory = (dir) => {
      const items = fs.readdirSync(dir);

      items.forEach((item) => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          traverseDirectory(fullPath);
        } else if (stat.isFile() && /\.(ts|tsx|js|jsx)$/.test(item)) {
          checkFile(fullPath);
        }
      });
    };

    traverseDirectory(srcDir);
    return issues;
  },

  // Check Next.js configuration for performance optimizations
  checkNextConfig: () => {
    const issues = [];
    const configPath = path.join(process.cwd(), 'next.config.js');
    const configPathMjs = path.join(process.cwd(), 'next.config.mjs');

    const configExists = fs.existsSync(configPath) || fs.existsSync(configPathMjs);

    if (!configExists) {
      issues.push({
        type: 'next-config',
        message: 'No Next.js configuration found - consider adding optimizations',
        severity: 'info',
      });
      return issues;
    }

    try {
      const actualConfigPath = fs.existsSync(configPath) ? configPath : configPathMjs;
      const configContent = fs.readFileSync(actualConfigPath, 'utf8');

      // Check for image optimization
      if (!configContent.includes('images')) {
        issues.push({
          type: 'next-config',
          message: 'Image optimization not configured in Next.js config',
          severity: 'warning',
        });
      }

      // Check for experimental features
      if (!configContent.includes('experimental')) {
        issues.push({
          type: 'next-config',
          message: 'Consider enabling experimental features for better performance',
          severity: 'info',
        });
      }

      // Check for bundle analyzer
      if (!configContent.includes('bundle-analyzer') && !configContent.includes('ANALYZE')) {
        issues.push({
          type: 'next-config',
          message: 'Bundle analyzer not configured for size monitoring',
          severity: 'info',
        });
      }
    } catch (error) {
      issues.push({
        type: 'next-config',
        message: `Error reading Next.js config: ${error.message}`,
        severity: 'warning',
      });
    }

    return issues;
  },

  // Check package.json for performance-related dependencies
  checkDependencies: () => {
    const issues = [];
    const packagePath = path.join(process.cwd(), 'package.json');

    if (!fs.existsSync(packagePath)) {
      return issues;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Check for heavy dependencies
      const heavyDeps = [
        'moment', // Suggest date-fns or dayjs instead
        'lodash', // Check if tree-shaking is enabled
        'jquery', // Generally unnecessary in React
        'bootstrap', // Heavy CSS framework
      ];

      heavyDeps.forEach((dep) => {
        if (allDeps[dep]) {
          let suggestion = '';
          switch (dep) {
            case 'moment':
              suggestion = ' - consider date-fns or dayjs for smaller bundle size';
              break;
            case 'lodash':
              suggestion = ' - ensure tree-shaking is working or use specific imports';
              break;
            case 'jquery':
              suggestion = ' - generally unnecessary in React applications';
              break;
            case 'bootstrap':
              suggestion = ' - consider Tailwind CSS or lighter alternatives';
              break;
          }

          issues.push({
            type: 'dependency-analysis',
            message: `Heavy dependency detected: ${dep}${suggestion}`,
            severity: 'info',
            dependency: dep,
          });
        }
      });

      // Check for duplicate functionality
      if (allDeps['axios'] && allDeps['fetch']) {
        issues.push({
          type: 'dependency-analysis',
          message: 'Multiple HTTP clients detected (axios + fetch) - consider using one',
          severity: 'info',
        });
      }
    } catch (error) {
      issues.push({
        type: 'dependency-analysis',
        message: `Error reading package.json: ${error.message}`,
        severity: 'error',
      });
    }

    return issues;
  },
};

// Main performance audit function
function runPerformanceAudit() {
  console.log('🚀 Running Performance Audit...\n');

  const allIssues = [];
  let totalIssues = 0;

  // Run all performance checks
  Object.entries(performanceChecks).forEach(([checkName, checkFn]) => {
    console.log(`Running ${checkName}...`);
    const issues = checkFn();
    allIssues.push(...issues);
    totalIssues += issues.length;
  });

  // Report results
  console.log('\n📊 Performance Audit Results\n');
  console.log('='.repeat(50));

  if (totalIssues === 0) {
    console.log('✅ No performance issues found!');
  } else {
    const errors = allIssues.filter((issue) => issue.severity === 'error');
    const warnings = allIssues.filter((issue) => issue.severity === 'warning');
    const info = allIssues.filter((issue) => issue.severity === 'info');

    console.log(`\n📈 Summary: ${totalIssues} issues found`);
    console.log(`   ${errors.length} error(s), ${warnings.length} warning(s), ${info.length} info`);

    // Group issues by type
    const issuesByType = {};
    allIssues.forEach((issue) => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push(issue);
    });

    Object.entries(issuesByType).forEach(([type, issues]) => {
      console.log(`\n📋 ${type.toUpperCase().replace('-', ' ')}`);
      issues.forEach((issue) => {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`   ${icon} ${issue.message}`);
        if (issue.file) console.log(`      File: ${issue.file}`);
        if (issue.size) console.log(`      Size: ${issue.size}KB`);
      });
    });
  }

  // Provide recommendations
  console.log('\n💡 Performance Recommendations:');
  console.log('1. Enable Next.js Image optimization for all images');
  console.log('2. Use dynamic imports for large components');
  console.log('3. Implement proper caching headers');
  console.log('4. Consider using a CDN for static assets');
  console.log('5. Monitor Core Web Vitals regularly');
  console.log('6. Use React.memo() for expensive components');
  console.log('7. Implement proper code splitting');

  console.log('\n✨ Audit complete!');
}

// Run the audit if this script is executed directly
if (require.main === module) {
  runPerformanceAudit();
}

module.exports = { runPerformanceAudit, performanceChecks };
