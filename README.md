# ねこならべ（猫ロジックパズル）v1.0.0

8×8・8色ブロックの Queens 系パズル。GitHub Pages + GAS + スプレッドシート + Drive + Gemini。

## 構成
```
nekonarabe/
├─ index.html          画面（ログイン / ステージ選択 / ゲーム / 各モーダル）
├─ css/style.css
├─ js/
│  ├─ config.js        GAS_API_URL・バージョン・動画URLなど
│  ├─ settings.js      自動×・サウンド設定（端末保存）
│  ├─ api.js           GAS通信・セッション
│  ├─ sound.js         Gemini TTS再生（失敗時ブラウザ音声）・効果音
│  ├─ puzzle.js        盤面生成（唯一解保証）・判定・ヒント分析
│  ├─ game.js          盤面操作・ミス・クリア
│  └─ app.js           画面遷移・認証UI
├─ assets/             earth-loop.mp4 / earth-clear.mp4 を置く
└─ gas/Code.gs         API（認証・成績・ヒント・褒め言葉・TTS）
```

## GAS 設定
1. 新規 GAS に `gas/Code.gs` を貼る
2. スクリプトプロパティに `GEMINI_API_KEY` を追加
3. エディタで `setup()` を実行（DBシートとDriveフォルダを自動作成）
4. デプロイ → ウェブアプリ（実行: 自分 / アクセス: 全員）
5. URL を `js/config.js` の `GAS_API_URL` へ
6. （任意）`warmUpVoices()` で定番セリフを事前キャッシュ

## Google Earth Studio
書き出した動画を `assets/earth-loop.mp4`（背景）と `assets/earth-clear.mp4`（クリア画面）に配置。
無ければ夜空グラデーションで表示されます。
