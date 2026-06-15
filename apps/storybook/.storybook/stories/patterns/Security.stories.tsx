import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  LogOut,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

import { MFAVerifyForm, SessionTimeoutDialog } from '@/features/auth';
import { Button } from '@/lib/components/ui/button';
import { ConfirmDialog } from '@/lib/components/ui/confirm-dialog';

/**
 * セキュリティパターンカタログ
 *
 * Dayopt の認証・認可・データ保護に関するUXパターン一覧。
 * OWASP Top 10 準拠のエラーサニタイズ、MFA、セッション管理、破壊的操作保護を網羅。
 *
 * ## 防御レイヤー
 *
 * | レイヤー | 担当 | 例 |
 * |----------|------|-----|
 * | DB | RLS + SECURITY DEFINER | 全テーブル auth.uid() フィルタ |
 * | API | protectedProcedure + Zod | 認証必須 + 入力検証 |
 * | UI | エラーサニタイズ + 確認ダイアログ | OWASP準拠メッセージ + 破壊操作ガード |
 */
const meta = {
  title: 'Patterns/Security',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Overview: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">Security Patterns</h1>
      <p className="text-muted-foreground mb-8">
        認証・認可・データ保護に関する UI パターン。OWASP Top 10 準拠。
      </p>

      <div className="grid max-w-5xl gap-8">
        {/* 認証フロー全体像 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">認証フロー全体像</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            ログインから操作までの認証レイヤー。各ステップで異なるセキュリティ対策が適用される。
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <FlowStep icon={Lock} label="ログイン" sublabel="email + password / OAuth" />
            <ArrowRight className="text-muted-foreground size-4 shrink-0" />
            <FlowStep icon={Smartphone} label="MFA" sublabel="TOTP 6桁 / リカバリーコード" />
            <ArrowRight className="text-muted-foreground size-4 shrink-0" />
            <FlowStep icon={Clock} label="セッション" sublabel="自動延長 / タイムアウト警告" />
            <ArrowRight className="text-muted-foreground size-4 shrink-0" />
            <FlowStep icon={Shield} label="API" sublabel="protectedProcedure + userId" />
            <ArrowRight className="text-muted-foreground size-4 shrink-0" />
            <FlowStep icon={ShieldCheck} label="DB" sublabel="RLS auth.uid() フィルタ" />
          </div>
        </section>

        {/* エラーサニタイズ */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">エラーメッセージのサニタイズ（OWASP準拠）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            認証エラーはユーザー列挙攻撃を防ぐため、具体的な原因を開示しない。
            <code className="bg-container mx-1 rounded px-1 text-xs">getAuthErrorKey()</code>{' '}
            で全エラーを安全な i18n キーにマッピング。
          </p>

          <div className="overflow-x-auto">
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">場面</th>
                  <th className="py-2 text-left font-medium">Supabase 生エラー</th>
                  <th className="py-2 text-left font-medium">ユーザーに表示</th>
                  <th className="py-2 text-left font-medium">理由</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">ログイン失敗</td>
                  <td className="py-2">
                    <SanitizeExample type="raw" text="Invalid login credentials" />
                  </td>
                  <td className="py-2">
                    <SanitizeExample
                      type="safe"
                      text="メールアドレスまたはパスワードが正しくない"
                    />
                  </td>
                  <td className="py-2">メール/パスワードどちらが間違いか非開示</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">重複サインアップ</td>
                  <td className="py-2">
                    <SanitizeExample type="raw" text="User already registered" />
                  </td>
                  <td className="py-2">
                    <SanitizeExample type="safe" text="問題が起きた。もう一度試して" />
                  </td>
                  <td className="py-2">アカウント存在の推測を防止</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">レート制限</td>
                  <td className="py-2">
                    <SanitizeExample type="raw" text="Too many requests" />
                  </td>
                  <td className="py-2">
                    <SanitizeExample
                      type="safe"
                      text="試行回数が多すぎる。しばらく待ってから再度試して"
                    />
                  </td>
                  <td className="py-2">攻撃者にもブルートフォース防止を通知</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">パスワードリセット</td>
                  <td className="py-2">
                    <SanitizeExample type="raw" text="Email not found" />
                  </td>
                  <td className="py-2">
                    <SanitizeExample
                      type="safe"
                      text="登録済みならメールを送信した。受信ボックスを確認して"
                    />
                  </td>
                  <td className="py-2">アカウント有無を非開示</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>全認証エラーを i18n キー経由で表示</li>
                <li>ログイン失敗は常に同一メッセージ</li>
                <li>レート制限は具体的に伝える</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>&quot;このメールアドレスは登録されていない&quot;（アカウント存在の漏洩）</li>
                <li>&quot;パスワードが間違っている&quot;（メールが正しいことを暗示）</li>
                <li>Supabase の生エラーメッセージをそのまま表示</li>
              </ul>
            </div>
          </div>
        </section>

        {/* MFA パターン */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">MFA（多要素認証）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            TOTP 6桁コードとリカバリーコード（8文字英数字 x 10個）の2系統。
            デバイス紛失時のアカウント復旧パスを確保。
          </p>

          <div className="overflow-x-auto">
            <table className="mb-6 w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">方式</th>
                  <th className="py-2 text-left font-medium">入力UI</th>
                  <th className="py-2 text-left font-medium">用途</th>
                  <th className="py-2 text-left font-medium">セキュリティ特性</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">TOTP</td>
                  <td className="py-2">InputOTP（6スロット、自動送信）</td>
                  <td className="py-2">通常のログイン</td>
                  <td className="py-2">30秒ローテーション、タイミングセーフ検証</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">リカバリーコード</td>
                  <td className="py-2">テキスト入力（XXXX-XXXX、monospace）</td>
                  <td className="py-2">デバイス紛失時</td>
                  <td className="py-2">ワンタイム使用、HMAC-SHA256 ハッシュ保存</td>
                </tr>
              </tbody>
            </table>
          </div>

          <MFADemo />
        </section>

        {/* セッション管理 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">セッション管理</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            セッション期限切れ5分前に警告。ユーザーに延長またはログアウトの選択を促す。
          </p>

          <div className="overflow-x-auto">
            <table className="mb-6 w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">イベント</th>
                  <th className="py-2 text-left font-medium">UI</th>
                  <th className="py-2 text-left font-medium">挙動</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">残り5分</td>
                  <td className="py-2">SessionTimeoutDialog 表示</td>
                  <td className="py-2">カウントダウン開始、ESC 不可</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">延長ボタン</td>
                  <td className="py-2">ダイアログ閉じ</td>
                  <td className="py-2">トークンリフレッシュ</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">タイムアウト</td>
                  <td className="py-2">ログイン画面へリダイレクト</td>
                  <td className="py-2">セッション破棄</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SessionTimeoutDemo />
        </section>

        {/* 入力検証 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">入力検証パターン（API境界）</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            全 tRPC 入力は Zod で厳密にバリデーション。UI とサーバーの二重検証。
          </p>

          <div className="overflow-x-auto">
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">型</th>
                  <th className="py-2 text-left font-medium">バリデーション</th>
                  <th className="py-2 text-left font-medium">例</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">ID</td>
                  <td className="py-2">
                    <code className="bg-container rounded px-1 text-xs">z.string().uuid()</code>
                  </td>
                  <td className="py-2">entryId, tagId, planId</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">文字列</td>
                  <td className="py-2">
                    <code className="bg-container rounded px-1 text-xs">
                      z.string().min(1).max(N)
                    </code>
                  </td>
                  <td className="py-2">title (max 200), description (max 10000)</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">数値</td>
                  <td className="py-2">
                    <code className="bg-container rounded px-1 text-xs">
                      z.number().int().min(0).max(N)
                    </code>
                  </td>
                  <td className="py-2">fulfillment_score (1-3), planned_duration_minutes</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">列挙</td>
                  <td className="py-2">
                    <code className="bg-container rounded px-1 text-xs">z.enum([...])</code>
                  </td>
                  <td className="py-2">origin, sort_order</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">配列</td>
                  <td className="py-2">
                    <code className="bg-container rounded px-1 text-xs">z.array().max(100)</code>
                  </td>
                  <td className="py-2">bulk operations, tag IDs</td>
                </tr>
              </tbody>
            </table>
          </div>

          <pre className="bg-container overflow-x-auto rounded-lg p-4 text-xs">
            {`// tRPC ルーターでの入力検証パターン
export const tagsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(50),       // 長さ制限
      color: z.enum(['blue', 'green', ...]),  // 列挙型
    }))
    .mutation(async ({ ctx, input }) => {
      const service = createTagService(ctx.supabase);
      return service.create({
        userId: ctx.userId!,  // 必須: userId フィルタ
        ...input,
      });
    }),
});`}
          </pre>
        </section>

        {/* 破壊的操作の保護 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">破壊的操作の保護</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            不可逆な操作は UI + 確認ダイアログ + API の三重防御。
          </p>

          <div className="overflow-x-auto">
            <table className="mb-6 w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">操作</th>
                  <th className="py-2 text-left font-medium">UI防御</th>
                  <th className="py-2 text-left font-medium">API防御</th>
                  <th className="py-2 text-left font-medium">DB防御</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">アカウント削除</td>
                  <td className="py-2">destructive 確認 + icon</td>
                  <td className="py-2">protectedProcedure + userId</td>
                  <td className="py-2">RLS + CASCADE</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">エントリー削除</td>
                  <td className="py-2">destructive 確認</td>
                  <td className="py-2">protectedProcedure + userId</td>
                  <td className="py-2">soft delete (deleted_at)</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-medium">タグ削除</td>
                  <td className="py-2">destructive 確認 + 影響件数表示</td>
                  <td className="py-2">protectedProcedure + userId</td>
                  <td className="py-2">entries.tag_id SET NULL</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">MFA 無効化</td>
                  <td className="py-2">パスワード再確認</td>
                  <td className="py-2">AAL2 必須</td>
                  <td className="py-2">factor unenroll</td>
                </tr>
              </tbody>
            </table>
          </div>

          <AccountDeleteDemo />
        </section>

        {/* 防御レイヤーまとめ */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">防御レイヤーまとめ</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <DefenseCard
              icon={ShieldCheck}
              title="DB層"
              items={[
                'RLS 全テーブル有効 (17/17)',
                'auth.uid() フィルタ',
                'SECURITY DEFINER に IDOR 防止',
                'soft delete で復旧可能性',
              ]}
            />
            <DefenseCard
              icon={Shield}
              title="API層"
              items={[
                'publicProcedure ゼロ',
                'Zod 厳密バリデーション',
                'レート制限 (Upstash Redis)',
                'Webhook 署名検証',
              ]}
            />
            <DefenseCard
              icon={KeyRound}
              title="UI層"
              items={[
                'OWASP エラーサニタイズ',
                '確認ダイアログ (variant)',
                'セッションタイムアウト警告',
                'CSP + HSTS ヘッダー',
              ]}
            />
          </div>
        </section>

        {/* 実装チェックリスト */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">新機能追加時のセキュリティチェックリスト</h2>
          <div className="space-y-2 text-sm">
            <CheckItem text="tRPC ルーターは protectedProcedure を使用しているか" />
            <CheckItem text="Service 層に userId を渡しているか" />
            <CheckItem text="入力を Zod で検証しているか（UUID, 長さ制限, 範囲制限）" />
            <CheckItem text="認証エラーを getAuthErrorKey() 経由で表示しているか" />
            <CheckItem text="不可逆操作に ConfirmDialog (variant='destructive') を設置しているか" />
            <CheckItem text="SECURITY DEFINER 関数に auth.uid() チェックがあるか" />
            <CheckItem text="dangerouslySetInnerHTML を使用していないか" />
            <CheckItem text="NEXT_PUBLIC_ に秘匿値を公開していないか" />
          </div>
        </section>
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function FlowStep({
  icon: Icon,
  label,
  sublabel,
}: {
  icon: typeof Lock;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="bg-container flex flex-col items-center gap-1 rounded-lg px-4 py-2">
      <Icon className="text-primary size-5" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-muted-foreground text-center text-xs">{sublabel}</span>
    </div>
  );
}

function SanitizeExample({ type, text }: { type: 'raw' | 'safe'; text: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${type === 'raw' ? 'text-destructive' : 'text-success'}`}
    >
      {type === 'raw' ? (
        <XCircle className="size-3.5 shrink-0" />
      ) : (
        <CheckCircle2 className="size-3.5 shrink-0" />
      )}
      {text}
    </span>
  );
}

function DefenseCard({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Shield;
  title: string;
  items: string[];
}) {
  return (
    <div className="border-border rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="text-primary size-5" />
        <h3 className="font-medium">{title}</h3>
      </div>
      <ul className="text-muted-foreground space-y-1 text-sm">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle2 className="text-success mt-0.5 size-3.5 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <label className="text-muted-foreground flex items-start gap-2">
      <input type="checkbox" className="mt-0.5" readOnly />
      {text}
    </label>
  );
}

function MFADemo() {
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [verificationCode, setVerificationCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  return (
    <div className="mx-auto max-w-md">
      <MFAVerifyForm
        mode={mode}
        verificationCode={verificationCode}
        onVerificationCodeChange={setVerificationCode}
        recoveryCode={recoveryCode}
        onRecoveryCodeChange={setRecoveryCode}
        isVerifying={false}
        error={null}
        onVerifyTotp={() => undefined}
        onVerifyRecovery={() => undefined}
        onSwitchMode={(m) => {
          setMode(m);
          setVerificationCode('');
          setRecoveryCode('');
        }}
        loginHref="/ja/auth/login"
      />
    </div>
  );
}

function SessionTimeoutDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <AlertTriangle className="mr-2 size-4" />
        セッションタイムアウト警告を表示
      </Button>
      <SessionTimeoutDialog
        open={open}
        remainingTime={180}
        onExtend={async () => setOpen(false)}
        onLogout={async () => setOpen(false)}
      />
    </>
  );
}

function AccountDeleteDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ShieldAlert className="mr-2 size-4" />
        アカウント削除の確認を表示
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="アカウントを削除する？"
        description="アカウントを削除すると、すべてのデータ（エントリー、タグ、記録）が完全に削除される。この操作は取り消せない"
        variant="destructive"
        icon={LogOut}
        confirmLabel="アカウントを削除"
      />
    </>
  );
}
