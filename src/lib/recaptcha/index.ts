/**
 * reCAPTCHA統合ライブラリ
 * @description Google reCAPTCHA v2/v3の統合
 */

// 設定
export { RECAPTCHA_CONFIG, isRecaptchaV2Enabled, isRecaptchaV3Enabled } from './config';

// サーバーサイド検証は '@/lib/recaptcha/verify' から直接 import する
// barrel に含めるとクライアントバンドルに env.ts が漏洩するため

// クライアントサイドフック
export { useRecaptchaV2, useRecaptchaV3 } from './hooks';

// コンポーネント
export { RecaptchaScript } from './RecaptchaScript';
