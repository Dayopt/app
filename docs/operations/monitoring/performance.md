# Performance Monitoring 運用

性能予算・SLO・設計方針は [Performance Budget](../../architecture/frontend/performance.md) を参照。このファイルは監視・計測の運用のみを扱う。

## 監視ツールの使い分け

| ツール            | 役割                   | 見るもの                         |
| ----------------- | ---------------------- | -------------------------------- |
| **Sentry**        | エラー・パフォーマンス | Issues, Web Vitals, Transactions |
| **Lighthouse CI** | リリース前チェック     | Core Web Vitals                  |

Sentry の詳細運用は [Sentry](sentry.md) / [Sentry Alerts](sentry-alerts.md)、bundle sizeの監視は [Bundle Monitoring](bundle-monitoring.md) を参照。
