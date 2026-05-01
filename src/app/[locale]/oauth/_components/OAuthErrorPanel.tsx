/**
 * OAuth flow 中の入力検証エラーを表示する panel。
 *
 * redirect_uri / client_id が信頼できない時点でクライアントへ redirect-based error を
 * 返さず、ユーザーに直接エラーを見せる (open redirect 防止)。
 */
export function OAuthErrorPanel({ message }: { message: string }) {
  return (
    <div className="bg-card border-border-subtle w-full max-w-md rounded-lg border p-6 shadow-sm">
      <p className="text-foreground text-sm leading-relaxed">{message}</p>
    </div>
  );
}
