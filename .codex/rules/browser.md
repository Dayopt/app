# Codex Browser Rules

Codex で Dayopt の UI、Storybook、Preview を視覚確認する時の browser surface 選択を定める。目的は Tomoya と Main が同じ画面を確認し、不要な browser 起動と再ログインを避けること。

## Priority

1. **既存の関連 Chrome tab を使う**
   - 視覚確認が必要になってから、開いている tab の title / URL を read-only で確認する
   - 対象の Dayopt、Storybook、Preview tab があれば、その exact tab を claim して再利用する
   - 同じ URL への `goto` や不要な reload を行わず、ユーザーの表示状態とログイン済み session を保つ
2. **必要な時だけ同じ Chrome に tab を開く**
   - 関連 tab がなく、画面を開かないと確認できない時だけ、接続済み Chrome に対象 URL を 1 tab 開く
   - Tomoya が続けて確認する画面は、作業後もその tab を残す
3. **Chrome を使えない時だけ内蔵 Browser を使う**
   - localhost、Storybook、公開ページなど、認証不要の確認に限定する
   - ログイン済み状態が必要な時は内蔵 Browser で再ログインせず、Chrome の接続またはユーザーのログインを依頼する
4. **独立 Playwright browser は自動化が必要な時だけ使う**
   - E2E の再現、反復可能な操作、複数 viewport / variant の比較、明示的な自動回帰確認に限定する
   - 単発の見た目確認や Storybook preview のためだけには起動しない

同じ evidence を得るために複数の browser surface を並行して使わない。既存 Chrome tab で確認できた後に、内蔵 Browser や独立 Playwright で同じ確認を繰り返さない。

## Storybook

- Storybook MCP は props、story 構成、docs の構造化情報を取得するために使う
- pixel / layout / interaction の確認は上記 Priority に従い、原則として既存 Chrome tab で行う
- Storybook が開いておらず視覚確認が必要なら、接続済み Chrome に `localhost:6006` の必要な story だけを開く

## Authentication and 1Password

- Chrome の既存ログイン session を最優先し、cookie、local storage、browser profile、password store を直接 inspect しない
- browser login と repo の `op run` / MCP secret 解決は別の仕組みとして扱う
- 1Password の password を読み出して表示・転記する運用にしない。browser 側で利用可能なら Chrome の 1Password autofill を使い、unlock、生体認証、MFA、CAPTCHA は Tomoya に handoff する
- full CDP access は console、network、DOM、performance の調査が必要な時だけ使い、通常の視覚確認では要求しない

## Privacy

- browser history や無関係な tab を探索しない
- tab 一覧から取得した無関係な title / URL を作業報告へ載せない
- 既存 tab を claim した場合は、依頼範囲外の navigation / reset を行わず release し、ユーザーの tab を閉じない
