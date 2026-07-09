/**
 * Commitlint設定
 *
 * Conventional Commits準拠のコミットメッセージを強制
 *
 * フォーマット: <type>(<scope>): <subject>
 *
 * 例:
 *   feat(auth): ログイン機能を追加
 *   fix(calendar): 日付表示のバグを修正
 *   docs(readme): インストール手順を更新
 *
 * @see https://www.conventionalcommits.org/
 * @see https://commitlint.js.org/
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // type は必須
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新機能
        'fix', // バグ修正
        'docs', // ドキュメント
        'style', // フォーマット（機能に影響しない）
        'refactor', // リファクタリング
        'perf', // パフォーマンス改善
        'test', // テスト追加・修正
        'build', // ビルド関連
        'ci', // CI設定
        'chore', // その他の変更
        'revert', // コミット取り消し
      ],
    ],
    // subject は空でない
    'subject-empty': [2, 'never'],
    // subject の最大長
    'subject-max-length': [2, 'always', 100],
    // type は空でない
    'type-empty': [2, 'never'],
    // type は小文字
    'type-case': [2, 'always', 'lower-case'],
  },
};
