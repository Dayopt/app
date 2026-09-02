import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * `runPrivateTimeblockSearchQuery`（同ディレクトリの
 * `private-timeblock-search-query.ts`）は検索語を含む PostgREST クエリの
 * 実行を Sentry の span / breadcrumb / auto error から隔離する privacy 境界。
 * `plan-service.ts` / `record-service.ts` / `timeblock-search-query.ts` は
 * 今日は正しく使っているが、この境界は `PROTECTED_PATH_GLOBS`
 * （`scripts/ci/protected-path-gate.mjs`）に載っていない。3 ファイルへ点で
 * 足しても、境界を破る PR が新しい 4 ファイル目を書けば同じ穴が開く
 * （#2503 class-based 是正）。
 *
 * ここでは wrapper 自身を除くこのディレクトリの全 .ts（非 test）ファイルを
 * 静的解析し、次の 2 種類の「検索語 taint」がラッパーを経由せず bare await
 * される経路が無いことを固定する:
 *   1. `.ilike(` / `.like(` / `.textSearch(` 呼び出し
 *   2. `x = x.or(...)` 形の検索 filter 適用（`buildTimeblockSearchFilter` の
 *      戻り値を `.or()` で query へ適用する、このディレクトリの既存 idiom）
 *
 * 判定は完全な dataflow 解析ではなく、このディレクトリの既存 idiom
 * （`search ? await runPrivateTimeblockSearchQuery(() => query) : await query`）
 * を安全とみなすヒューリスティックである: taint を導入した if 文の条件式と
 * 同じテキストでガードされた分岐（三項演算子の false 側 / if-else の else 側）
 * にある bare await だけを許容する。ガードが無い、またはガードの条件式が
 * 一致しない bare await は違反として報告する。
 */

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const WRAPPER_FILE = 'private-timeblock-search-query.ts';
const WRAPPER_FUNCTION = 'runPrivateTimeblockSearchQuery';
const TAINTING_METHODS = new Set(['ilike', 'like', 'textSearch']);

interface Violation {
  file: string;
  line: number;
  detail: string;
}

interface TaintRecord {
  targetName: string;
  guardText: string | null;
  pos: number;
  scope: ts.Node;
}

function listCandidateFiles(): string[] {
  return readdirSync(SERVER_DIR)
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => !name.endsWith('.test.ts'))
    .filter((name) => name !== WRAPPER_FILE)
    .sort();
}

/** チェーンの左端（呼び出し元の変数）を辿る。`a.b().c(...)` -> `a`。 */
function leftmostIdentifier(expr: ts.Expression): string | null {
  let current: ts.Expression = expr;
  for (;;) {
    if (ts.isIdentifier(current)) return current.text;
    if (ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
      current = current.expression;
      continue;
    }
    return null;
  }
}

/** taint 呼び出しが `runPrivateTimeblockSearchQuery(() => ...)` の arrow body 内かどうか。 */
function isInsideWrapperArrow(node: ts.Node): boolean {
  const arrow = ts.findAncestor(node, (ancestor): ancestor is ts.ArrowFunction => {
    if (!ts.isArrowFunction(ancestor)) return false;
    const parent = ancestor.parent;
    return (
      ts.isCallExpression(parent) &&
      ts.isIdentifier(parent.expression) &&
      parent.expression.text === WRAPPER_FUNCTION &&
      parent.arguments[0] === ancestor
    );
  });
  return arrow !== undefined;
}

/** 直近の enclosing IfStatement の条件式テキスト（無ければ null）。 */
function enclosingIfGuardText(node: ts.Node): string | null {
  const ifStatement = ts.findAncestor(node, ts.isIfStatement);
  return ifStatement ? ifStatement.expression.getText() : null;
}

/** 直近の関数スコープ（await の探索範囲を関数単位に絞る）。 */
function enclosingFunctionScope(node: ts.Node): ts.Node {
  return ts.findAncestor(node, ts.isFunctionLike) ?? node.getSourceFile();
}

function isDescendantOf(node: ts.Node, ancestorCandidate: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (current === ancestorCandidate) return true;
    current = current.parent;
  }
  return false;
}

/** bare await（`await X` で X が識別子そのもの）が、taint と同じ guard で安全に分岐されているか。 */
function isSafelyGuardedAgainst(awaitNode: ts.AwaitExpression, guardText: string | null): boolean {
  if (guardText === null) return false;

  const conditional = ts.findAncestor(
    awaitNode,
    (ancestor): ancestor is ts.ConditionalExpression => {
      if (!ts.isConditionalExpression(ancestor)) return false;
      // awaitNode が whenFalse 側（= guard が偽の側）にあることを確認する。
      return (
        isDescendantOf(awaitNode, ancestor.whenFalse) && ancestor.condition.getText() === guardText
      );
    },
  );
  if (conditional) return true;

  const ifStatement = ts.findAncestor(awaitNode, (ancestor): ancestor is ts.IfStatement => {
    if (!ts.isIfStatement(ancestor)) return false;
    return (
      ancestor.elseStatement !== undefined &&
      isDescendantOf(awaitNode, ancestor.elseStatement) &&
      ancestor.expression.getText() === guardText
    );
  });
  return ifStatement !== undefined;
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function analyzeFile(fileName: string, sourceText: string): Violation[] {
  const violations: Violation[] = [];
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const taints: TaintRecord[] = [];

  function recordAssignmentTaint(assignmentLike: ts.Node, targetExpr: ts.Expression | undefined) {
    if (!targetExpr || !ts.isIdentifier(targetExpr)) {
      violations.push({
        file: fileName,
        line: lineOf(sourceFile, assignmentLike.getStart()),
        detail:
          '検索語 taint（.ilike/.like/.textSearch または x = x.or(...)）の代入先が単純な識別子ではなく追跡できません。',
      });
      return;
    }
    taints.push({
      targetName: targetExpr.text,
      guardText: enclosingIfGuardText(assignmentLike),
      pos: assignmentLike.getEnd(),
      scope: enclosingFunctionScope(assignmentLike),
    });
  }

  function visit(node: ts.Node) {
    // 1. `.ilike(` / `.like(` / `.textSearch(` 呼び出し
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      TAINTING_METHODS.has(node.expression.name.text)
    ) {
      if (!isInsideWrapperArrow(node)) {
        const assignment = ts.findAncestor(
          node,
          (ancestor): ancestor is ts.BinaryExpression =>
            ts.isBinaryExpression(ancestor) &&
            ancestor.operatorToken.kind === ts.SyntaxKind.EqualsToken,
        );
        const declaration = ts.findAncestor(node, ts.isVariableDeclaration);
        if (assignment) {
          recordAssignmentTaint(assignment, assignment.left);
        } else if (declaration) {
          recordAssignmentTaint(
            declaration,
            ts.isIdentifier(declaration.name) ? declaration.name : undefined,
          );
        } else {
          violations.push({
            file: fileName,
            line: lineOf(sourceFile, node.getStart()),
            detail: `.${node.expression.name.text}(...) 呼び出しが runPrivateTimeblockSearchQuery(() => ...) の外にあり、代入先の変数も追跡できません。`,
          });
        }
      }
    }

    // 2. `x = x.or(...)` 形の検索 filter 適用
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      ts.isCallExpression(node.right) &&
      ts.isPropertyAccessExpression(node.right.expression) &&
      node.right.expression.name.text === 'or' &&
      leftmostIdentifier(node.right.expression.expression) === node.left.text
    ) {
      if (!isInsideWrapperArrow(node)) {
        recordAssignmentTaint(node, node.left);
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (taints.length === 0) return violations;

  function visitAwait(node: ts.Node) {
    if (ts.isAwaitExpression(node)) {
      // `await query` だけでなく `await query.limit(10)` / `await query.single()`
      // のような chained call / property access も taint 変数を経由していれば
      // 検知する。leftmostIdentifier は taint 呼び出し側の左端識別子抽出と同じ
      // ロジックを再利用する（risk-reviewer 指摘 #2503: bare identifier のみを見ると
      // chain 付き await が素通りしてしまう）。
      const name = leftmostIdentifier(node.expression);
      if (name !== null) {
        for (const taint of taints) {
          if (
            taint.targetName === name &&
            node.getStart() > taint.pos &&
            isDescendantOf(node, taint.scope)
          ) {
            if (!isSafelyGuardedAgainst(node, taint.guardText)) {
              violations.push({
                file: fileName,
                line: lineOf(sourceFile, node.getStart()),
                detail: `\`await ${node.expression.getText()}\` が runPrivateTimeblockSearchQuery(() => ...) でラップされておらず、taint（${
                  taint.guardText ? `if (${taint.guardText}) ...` : '無条件'
                }）を安全に迂回できません。`,
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visitAwait);
  }
  visitAwait(sourceFile);

  return violations;
}

describe('private search boundary contract (#2503)', () => {
  it('検索語 taint はディレクトリ内のどのファイルでも runPrivateTimeblockSearchQuery を bare await で迂回しない', () => {
    const files = listCandidateFiles();
    // このディレクトリに .ts ファイルが実在することを確認する（読み違いで
    // 0 件のまま常に green になる退化を防ぐ）。
    expect(files.length).toBeGreaterThan(0);

    const allViolations: Violation[] = [];
    for (const file of files) {
      const fullPath = join(SERVER_DIR, file);
      const sourceText = readFileSync(fullPath, 'utf8');
      allViolations.push(...analyzeFile(file, sourceText));
    }

    expect(allViolations).toEqual([]);
  });

  it('wrapper 自身と test ファイルはスキャン対象から除外する', () => {
    const files = listCandidateFiles();
    expect(files).not.toContain(WRAPPER_FILE);
    expect(files.every((file) => !file.endsWith('.test.ts'))).toBe(true);
  });
});
