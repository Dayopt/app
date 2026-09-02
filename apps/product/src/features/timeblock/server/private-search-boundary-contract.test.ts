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
 * 再帰的に走査し、`.ilike(` / `.like(` / `.textSearch(` / `.or(`（`
 * buildTimeblockSearchFilter` の戻り値を query へ適用する、このディレクトリの
 * 既存 idiom）の呼び出しがラッパーを経由せず bare await される経路が無いことを
 * 固定する。代入先は `x = x.or(...)` の再代入だけでなく `const q = base.or(...)`
 * のような宣言時代入も追跡する（Codex 指摘 #2546: `.or()` だけ同じ変数への
 * 再代入に限定していた旧実装は、新しい変数への宣言時代入を見逃していた。
 * `.ilike()` 等と同じ汎用検出へ統合して class ごと閉じた）。
 *
 * 判定は完全な dataflow 解析ではなく、このディレクトリの既存 idiom
 * （`search ? await runPrivateTimeblockSearchQuery(() => query) : await query`）
 * を安全とみなすヒューリスティックである: taint を導入した if 文の条件式と
 * 同じテキストでガードされ、かつ **taint とは逆側の分岐**（taint が if の
 * then 側にあれば三項演算子の false 側 / if-else の else 側、taint が
 * else 側にあれば逆）にある bare await だけを許容する。ガードが無い、
 * ガードの条件式が一致しない、または taint と同じ側にある bare await は
 * 違反として報告する（Codex 指摘 #2546: `if (!search) {} else { query =
 * query.or(...); await query }` のように taint と bare await が同じ
 * else 節に同居する形は、ガード文字列の一致だけを見ていた旧実装では
 * 安全と誤判定していた）。
 */

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const WRAPPER_FILE = 'private-timeblock-search-query.ts';
const WRAPPER_FUNCTION = 'runPrivateTimeblockSearchQuery';
const TAINTING_METHODS = new Set(['ilike', 'like', 'textSearch', 'or']);

interface Violation {
  file: string;
  line: number;
  detail: string;
}

interface IfGuard {
  text: string;
  /** taint 自身がこの if 文のどちら側の分岐にあるか。 */
  branch: 'then' | 'else';
}

interface TaintRecord {
  targetName: string;
  guard: IfGuard | null;
  pos: number;
  scope: ts.Node;
}

/**
 * `SERVER_DIR` 配下を再帰的に走査し、非 test の `.ts` ファイルを repo-relative
 * （`SERVER_DIR` 基点）の相対パスで返す。直下だけを見ていた旧実装は、将来
 * `server/<subdir>/*.ts` のようなサブディレクトリへ検索処理が追加された場合に
 * 素通りしていた（Codex 指摘 #2546）。
 */
function listCandidateFiles(): string[] {
  const results: string[] = [];
  function walk(dir: string, prefix: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relativePath);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.test.ts')) continue;
      if (relativePath === WRAPPER_FILE) continue;
      results.push(relativePath);
    }
  }
  walk(SERVER_DIR, '');
  return results.sort();
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

/**
 * 直近の enclosing IfStatement の条件式テキストと、node がどちら側の
 * 分岐にあるか。thenStatement / elseStatement のどちらの子孫でもない
 * （条件式自体の中など、taint 呼び出し側では通常起きない）場合は
 * ガード無しとして安全側に倒す。
 */
function enclosingIfGuard(node: ts.Node): IfGuard | null {
  const ifStatement = ts.findAncestor(node, ts.isIfStatement);
  if (!ifStatement) return null;
  if (isDescendantOf(node, ifStatement.thenStatement)) {
    return { text: ifStatement.expression.getText(), branch: 'then' };
  }
  if (ifStatement.elseStatement && isDescendantOf(node, ifStatement.elseStatement)) {
    return { text: ifStatement.expression.getText(), branch: 'else' };
  }
  return null;
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

/**
 * bare await が、taint とは逆側の分岐で安全にガードされているか。
 *
 * 単に「同じテキストの条件式を持つ if/三項演算子の中にあるか」だけでは、
 * taint と bare await が同じ分岐（例: 同じ else 節）に同居していても
 * 安全と誤判定してしまう（Codex 指摘 #2546）。taint 側の branch を反転
 * させた側でなければ安全と認めない。
 */
function isSafelyGuardedAgainst(
  awaitNode: ts.AwaitExpression,
  taintGuard: IfGuard | null,
): boolean {
  if (taintGuard === null) return false;

  const conditional = ts.findAncestor(
    awaitNode,
    (ancestor): ancestor is ts.ConditionalExpression => {
      if (!ts.isConditionalExpression(ancestor)) return false;
      if (ancestor.condition.getText() !== taintGuard.text) return false;
      // taint が then 側なら await は三項の whenFalse、taint が else 側なら whenTrue。
      const oppositeBranch = taintGuard.branch === 'then' ? ancestor.whenFalse : ancestor.whenTrue;
      return isDescendantOf(awaitNode, oppositeBranch);
    },
  );
  if (conditional) return true;

  const ifStatement = ts.findAncestor(awaitNode, (ancestor): ancestor is ts.IfStatement => {
    if (!ts.isIfStatement(ancestor)) return false;
    if (ancestor.expression.getText() !== taintGuard.text) return false;
    // taint が then 側なら await は else 側、taint が else 側なら await は then 側。
    if (taintGuard.branch === 'then') {
      return (
        ancestor.elseStatement !== undefined && isDescendantOf(awaitNode, ancestor.elseStatement)
      );
    }
    return isDescendantOf(awaitNode, ancestor.thenStatement);
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
      guard: enclosingIfGuard(assignmentLike),
      pos: assignmentLike.getEnd(),
      scope: enclosingFunctionScope(assignmentLike),
    });
  }

  function visit(node: ts.Node) {
    // `.ilike(` / `.like(` / `.textSearch(` / `.or(` 呼び出し。代入先が
    // `x = x.or(...)` の再代入か `const q = base.or(...)` の宣言時代入かは
    // 問わず、識別子1つに絞れる形なら等しく追跡する（Codex 指摘 #2546:
    // `.or()` だけ同じ変数への再代入に限定していた旧実装は、新しい変数への
    // 宣言時代入を見逃していた）。
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
            if (!isSafelyGuardedAgainst(node, taint.guard)) {
              violations.push({
                file: fileName,
                line: lineOf(sourceFile, node.getStart()),
                detail: `\`await ${node.expression.getText()}\` が runPrivateTimeblockSearchQuery(() => ...) でラップされておらず、taint（${
                  taint.guard
                    ? `${taint.guard.branch === 'then' ? 'if' : 'else'} (${taint.guard.text}) ...`
                    : '無条件'
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
