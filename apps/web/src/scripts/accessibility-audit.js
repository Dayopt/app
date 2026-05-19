#!/usr/bin/env node

/**
 * Accessibility audit script for static HTML analysis
 * This script analyzes the built HTML files for accessibility issues
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Accessibility rules to check
const accessibilityRules = {
  // Check for missing alt attributes on images
  checkImageAltAttributes: (document) => {
    const issues = [];
    const images = document.querySelectorAll('img');

    images.forEach((img, index) => {
      if (!img.hasAttribute('alt')) {
        issues.push({
          type: 'missing-alt',
          element: 'img',
          message: 'Image is missing alt attribute',
          line: `Image ${index + 1}`,
          severity: 'error',
        });
      } else if (img.getAttribute('alt').trim() === '') {
        // Empty alt is OK for decorative images, but check if it should have content
        const src = img.getAttribute('src');
        if (src && !src.includes('decoration') && !src.includes('icon')) {
          issues.push({
            type: 'empty-alt',
            element: 'img',
            message: 'Image has empty alt attribute but may need descriptive text',
            line: `Image ${index + 1}: ${src}`,
            severity: 'warning',
          });
        }
      }
    });

    return issues;
  },

  // Check heading hierarchy
  checkHeadingHierarchy: (document) => {
    const issues = [];
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let lastLevel = 0;

    headings.forEach((heading, index) => {
      const currentLevel = parseInt(heading.tagName.charAt(1));

      if (index === 0 && currentLevel !== 1) {
        issues.push({
          type: 'heading-hierarchy',
          element: heading.tagName.toLowerCase(),
          message: 'Page should start with h1',
          line: `First heading is ${heading.tagName}`,
          severity: 'error',
        });
      }

      if (currentLevel > lastLevel + 1) {
        issues.push({
          type: 'heading-hierarchy',
          element: heading.tagName.toLowerCase(),
          message: `Heading level skipped: ${heading.tagName} after h${lastLevel}`,
          line: `Heading ${index + 1}: "${heading.textContent?.trim()}"`,
          severity: 'error',
        });
      }

      lastLevel = currentLevel;
    });

    return issues;
  },

  // Check form labels
  checkFormLabels: (document) => {
    const issues = [];
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="password"], input[type="tel"], input[type="url"], input[type="search"], textarea, select',
    );

    inputs.forEach((input, index) => {
      const id = input.getAttribute('id');
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledby = input.getAttribute('aria-labelledby');

      let hasLabel = false;

      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) hasLabel = true;
      }

      if (ariaLabel || ariaLabelledby) hasLabel = true;

      if (!hasLabel) {
        issues.push({
          type: 'missing-label',
          element: input.tagName.toLowerCase(),
          message: 'Form input is missing a label',
          line: `Input ${index + 1}: ${input.getAttribute('type') || 'textarea'}`,
          severity: 'error',
        });
      }
    });

    return issues;
  },

  // Check color contrast (basic check for common patterns)
  checkBasicContrast: (document) => {
    const issues = [];
    const elements = document.querySelectorAll('[style*="color"], [class*="text-"]');

    // This is a simplified check - in a real audit you'd compute actual contrast ratios
    elements.forEach((element, index) => {
      const style = element.getAttribute('style');
      const className = element.getAttribute('class');

      // Check for potential low contrast patterns
      if (style?.includes('color: gray') || className?.includes('text-gray-400')) {
        issues.push({
          type: 'potential-contrast',
          element: element.tagName.toLowerCase(),
          message: 'Element may have low color contrast',
          line: `Element ${index + 1}: ${element.textContent?.trim()?.substring(0, 50)}...`,
          severity: 'warning',
        });
      }
    });

    return issues;
  },

  // Check for interactive elements without proper focus indicators
  checkFocusIndicators: (document) => {
    const issues = [];
    const interactiveElements = document.querySelectorAll(
      'button, a, input, textarea, select, [tabindex]',
    );

    interactiveElements.forEach((element, index) => {
      const className = element.getAttribute('class') || '';

      // Check if focus styles are likely present
      if (!className.includes('focus:') && !className.includes('focus-')) {
        issues.push({
          type: 'missing-focus',
          element: element.tagName.toLowerCase(),
          message: 'Interactive element may be missing focus indicators',
          line: `Element ${index + 1}: ${element.tagName} - "${element.textContent?.trim()?.substring(0, 30)}..."`,
          severity: 'warning',
        });
      }
    });

    return issues;
  },

  // Check landmark structure
  checkLandmarks: (document) => {
    const issues = [];

    // Check for main landmark
    const main = document.querySelector('main, [role="main"]');
    if (!main) {
      issues.push({
        type: 'missing-landmark',
        element: 'main',
        message: 'Page is missing a main landmark',
        line: 'Document structure',
        severity: 'error',
      });
    }

    // Check for navigation landmark
    const nav = document.querySelector('nav, [role="navigation"]');
    if (!nav) {
      issues.push({
        type: 'missing-landmark',
        element: 'nav',
        message: 'Page is missing a navigation landmark',
        line: 'Document structure',
        severity: 'warning',
      });
    }

    return issues;
  },
};

// Analyze a single HTML file
function analyzeHTMLFile(filePath) {
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const allIssues = [];

    // Run all accessibility checks
    Object.values(accessibilityRules).forEach((rule) => {
      const issues = rule(document);
      allIssues.push(...issues);
    });

    return {
      file: filePath,
      issues: allIssues,
    };
  } catch (error) {
    return {
      file: filePath,
      error: error.message,
      issues: [],
    };
  }
}

// Find all HTML files in the .next/server directory
function findHTMLFiles(dir) {
  const htmlFiles = [];

  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (item.endsWith('.html')) {
        htmlFiles.push(fullPath);
      }
    }
  }

  if (fs.existsSync(dir)) {
    traverse(dir);
  }

  return htmlFiles;
}

// Main audit function
function runAccessibilityAudit() {
  console.log('🔍 Running Accessibility Audit...\n');

  const serverDir = path.join(process.cwd(), '.next', 'server', 'app');
  const htmlFiles = findHTMLFiles(serverDir);

  if (htmlFiles.length === 0) {
    console.log('❌ No HTML files found. Make sure to run "npm run build" first.\n');
    return;
  }

  console.log(`📄 Found ${htmlFiles.length} HTML files to analyze\n`);

  const results = [];
  let totalIssues = 0;

  htmlFiles.forEach((file) => {
    const result = analyzeHTMLFile(file);
    results.push(result);
    totalIssues += result.issues.length;
  });

  // Report results
  console.log('📊 Accessibility Audit Results\n');
  console.log('='.repeat(50));

  results.forEach((result) => {
    if (result.error) {
      console.log(`❌ Error analyzing ${path.basename(result.file)}: ${result.error}`);
      return;
    }

    const relativePath = path.relative(process.cwd(), result.file);
    const errors = result.issues.filter((issue) => issue.severity === 'error');
    const warnings = result.issues.filter((issue) => issue.severity === 'warning');

    if (result.issues.length === 0) {
      console.log(`✅ ${relativePath} - No issues found`);
    } else {
      console.log(`\n📄 ${relativePath}`);
      console.log(`   ${errors.length} error(s), ${warnings.length} warning(s)`);

      result.issues.forEach((issue) => {
        const icon = issue.severity === 'error' ? '❌' : '⚠️ ';
        console.log(`   ${icon} ${issue.message}`);
        console.log(`      ${issue.line}`);
      });
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`📈 Summary: ${totalIssues} total issues found across ${results.length} files`);

  if (totalIssues === 0) {
    console.log('🎉 Congratulations! No accessibility issues found.');
  } else {
    console.log('💡 Review the issues above to improve accessibility compliance.');
  }

  console.log('\n✨ Audit complete!');
}

// Run the audit if this script is executed directly
if (require.main === module) {
  runAccessibilityAudit();
}

module.exports = { runAccessibilityAudit, accessibilityRules };
