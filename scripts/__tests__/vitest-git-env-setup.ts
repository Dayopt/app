// git hook（pre-push 等）経由でこの test suite が起動すると、git 自身が
// hook プロセスへ GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE 等を注入する。
// scripts/**/*.test.ts の git fixture は mkdtemp + 明示 cwd で隔離している
// つもりでも、child_process は既定で process.env を継承するため、これらの
// 変数が残っていると子 git プロセスは cwd ではなく継承した GIT_DIR 側を
// 実 repo として扱ってしまう（#2365 で実 repo の .git/config が
// core.bare=true とテスト用 user identity に汚染される事故として顕在化）。
// worker 起動時に一度だけ確実に消しておく。
for (const key of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_CEILING_DIRECTORIES',
]) {
  delete process.env[key];
}
