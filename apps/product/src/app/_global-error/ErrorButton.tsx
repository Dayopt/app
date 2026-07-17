/**
 * インラインスタイルのみで動作するボタン
 *
 * global-error.tsx では shadcn/ui Button が正常に動作しない可能性があるため、
 * CSS変数に依存しないインラインスタイルを使用する。
 */
export function ErrorButton({
  children,
  onClick,
  variant = 'primary',
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'outline';
}) {
  const baseStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '0.625rem 1rem',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    textAlign: 'center',
    cursor: 'pointer',
    border: 'none',
    transition: 'opacity 0.15s',
  };

  const styles: React.CSSProperties =
    variant === 'primary'
      ? { ...baseStyle, backgroundColor: 'var(--ge-primary)', color: 'var(--ge-foreground)' }
      : {
          ...baseStyle,
          backgroundColor: 'transparent',
          color: 'var(--ge-muted)',
          border: '1px solid var(--ge-border)',
        };

  return (
    <button onClick={onClick} style={styles}>
      {children}
    </button>
  );
}
