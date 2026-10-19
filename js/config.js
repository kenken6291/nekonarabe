/**
 * ねこならべ 設定ファイル
 * GAS をデプロイし直したら GAS_API_URL だけ差し替えればOK
 */
window.APP_CONFIG = {
  APP_NAME: 'ねこならべ',
  VERSION: 'v1.0.0',

  // GAS Web アプリの URL（デプロイ → ウェブアプリ → URL）
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbw_TvouKo-t0UXyHv5-iAGmQOLOBgVgITNgaKGqXGOr4Jk1SIdRhJezHeBpfENaXTPaMg/exec',

  // Google Earth Studio で書き出した背景ループ動画（WebM/MP4推奨・リポジトリ内に置くと安定）
  BG_VIDEO_URL: 'assets/earth-loop.mp4',
  CLEAR_VIDEO_URL: 'assets/earth-clear.mp4',

  STAGE_COUNT: 30,      // ステージ数
  MAX_LIVES: 3,         // ミス許容数（魚の数）
  TTS_ENABLED: true,    // Gemini TTS を使うか（失敗時はブラウザ音声に自動切替）
};
