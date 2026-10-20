/**
 * ねこならべ — GAS バックエンド（JSON API）
 *
 * スクリプトプロパティ:
 *   GEMINI_API_KEY   … 必須（ヒント・褒め言葉・TTS）
 *   GEMINI_MODEL     … 任意（既定: gemini-2.5-flash）
 *   GEMINI_TTS_MODEL … 任意（既定: gemini-2.5-flash-preview-tts）
 *   TTS_VOICE        … 任意（既定: Leda）
 *   SHEET_ID / DRIVE_FOLDER_ID … setup() が自動で設定
 *   HUB_SSO_SECRET   … RETRO ARCADE HUB 連携用（ハブのGASで setupSsoSecret() を実行して
 *                      表示された値と同じものを設定）。未設定ならハブ連携は無効
 *
 * RETRO ARCADE HUB 連携：
 *   ハブでログイン済みの会員は、ハブが発行した入場チケット（HMAC署名・2分有効・使い捨て）を
 *   URLの #hub=… で受け取り、パスワードなしでログインできる。
 *   ・正規会員（メールあり）… 同じメールの会員がいればその会員として、いなければ新規作成
 *   ・お試し会員（メールなし）… 「hub:会員番号」を識別子として新規作成
 *   ハブ経由で作られた会員の status は 'hub'（パスワード未設定）。
 *   パスワードでも入りたい場合は「パスワード再発行」で設定できる（メールありのみ）。
 *
 * 初回: エディタで setup() を実行 → デプロイ（ウェブアプリ / 実行: 自分 / アクセス: 全員）
 */

const APP_VERSION = '1.1.0';
const APP_NAME = 'ねこならべ';
const TOKEN_DAYS = 30;
const MAX_FAIL = 5;
const LOCK_MINUTES = 15;
const PROPS = PropertiesService.getScriptProperties();

// RETRO ARCADE HUB 連携（シングルサインオン）
const HUB_SSO = {
  aud: 'nekonarabe',        // ハブ側 SSO_GAMES の値と一致させる
  noncePrefix: 'hubnonce_', // 使い捨てチェック用（CacheService）
  nonceSec: 600,
  idPrefix: 'hub:',         // メールのないハブ会員の識別子（例：hub:m0001）
  maxClockSkewMs: 300000    // 発行時刻が未来すぎるチケットは拒否
};

const USER_HEADERS = ['email', 'passHash', 'salt', 'status', 'token', 'tokenExpires', 'createdAt', 'lastLogin', 'failCount', 'lockedUntil'];
const RESULT_HEADERS = ['email', 'stage', 'bestMs', 'mistakes', 'clearCount', 'updatedAt'];

// ================= セットアップ =================
function setup() {
  let ssId = PROPS.getProperty('SHEET_ID');
  let ss = ssId ? SpreadsheetApp.openById(ssId) : null;
  if (!ss) {
    ss = SpreadsheetApp.create(APP_NAME + ' DB');
    PROPS.setProperty('SHEET_ID', ss.getId());
  }
  ensureSheet_(ss, 'Users', USER_HEADERS);
  ensureSheet_(ss, 'Results', RESULT_HEADERS);
  const def = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  if (!PROPS.getProperty('DRIVE_FOLDER_ID')) {
    const folder = DriveApp.createFolder(APP_NAME + ' assets');
    PROPS.setProperty('DRIVE_FOLDER_ID', folder.getId());
  }
  Logger.log('SHEET: ' + ss.getUrl());
  Logger.log('FOLDER: ' + PROPS.getProperty('DRIVE_FOLDER_ID'));
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

function ss_() { return SpreadsheetApp.openById(PROPS.getProperty('SHEET_ID')); }
function sheet_(name) { return ss_().getSheetByName(name); }

// ================= ルーティング =================
function doGet() {
  return json_({ ok: true, app: APP_NAME, version: APP_VERSION });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const handler = HANDLERS[req.action];
    if (!handler) throw apiError_('不明な操作です');
    return json_(Object.assign({ ok: true }, handler(req) || {}));
  } catch (err) {
    return json_({ ok: false, error: err.message || String(err), code: err.code || '' });
  }
}

const HANDLERS = {
  register: register_,
  login: login_,
  hubLogin: hubLogin_,
  verify: verify_,
  changePassword: changePassword_,
  resetPassword: resetPassword_,
  logout: logout_,
  getProgress: getProgress_,
  saveResult: saveResult_,
  hint: hint_,
  praise: praise_,
  tts: tts_,
};

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function apiError_(msg, code) { const e = new Error(msg); e.code = code || ''; return e; }

// ================= ユーザー操作の共通 =================
function normEmail_(s) { return String(s || '').trim().toLowerCase(); }

function findUser_(email) {
  const sh = sheet_('Users');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === email) return { row: i + 1, data: rowToUser_(values[i]) };
  }
  return null;
}

function findUserByToken_(token) {
  if (!token) return null;
  const sh = sheet_('Users');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][4] && values[i][4] === token) return { row: i + 1, data: rowToUser_(values[i]) };
  }
  return null;
}

function rowToUser_(r) {
  const u = {};
  USER_HEADERS.forEach((h, i) => { u[h] = r[i]; });
  return u;
}

function writeUser_(row, u) {
  sheet_('Users').getRange(row, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS.map(h => u[h] === undefined ? '' : u[h])]);
}

function hash_(salt, pw) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function tempPassword_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s.replace(/^(.{9})./, '$1' + (Math.floor(Math.random() * 8) + 2)); // 数字を必ず含める
}

function sendTempMail_(email, temp, isReset) {
  const subject = `【${APP_NAME}】${isReset ? 'パスワード再発行' : '仮パスワードのお知らせ'}`;
  const body =
    `${APP_NAME} をご利用いただきありがとうございます。\n\n` +
    `仮パスワード： ${temp}\n\n` +
    `このパスワードでログインすると、本パスワードの設定画面が表示されます。\n` +
    `お心当たりのない場合は、このメールを破棄してください。\n\n— ${APP_NAME}`;
  GmailApp.sendEmail(email, subject, body, { name: APP_NAME });
}

function requireUser_(req) {
  const u = findUserByToken_(req.token);
  if (!u) throw apiError_('ログインが必要です', 'AUTH');
  if (new Date(u.data.tokenExpires).getTime() < Date.now()) throw apiError_('ログインの有効期限が切れました', 'AUTH');
  return u;
}

function requireActive_(req) {
  const u = requireUser_(req);
  // 'active'＝通常会員、'hub'＝アーケードハブ経由の会員（パスワード未設定）
  if (u.data.status !== 'active' && u.data.status !== 'hub') throw apiError_('パスワードの変更が必要です', 'AUTH');
  return u;
}

function issueToken_(u) {
  u.token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  u.tokenExpires = new Date(Date.now() + TOKEN_DAYS * 86400000);
  u.lastLogin = new Date();
}

// ================= 認証 =================
function register_(req) {
  const email = normEmail_(req.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError_('メールアドレスの形式が正しくありません');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findUser_(email);
    if (found && (found.data.status === 'active' || found.data.status === 'hub')) {
      throw apiError_('このメールアドレスは登録済みです。パスワードを忘れた場合は再発行してください');
    }
    const temp = tempPassword_();
    const salt = Utilities.getUuid();
    const u = {
      email, passHash: hash_(salt, temp), salt, status: 'temporary',
      token: '', tokenExpires: '', createdAt: new Date(), lastLogin: '', failCount: 0, lockedUntil: '',
    };
    if (found) { u.createdAt = found.data.createdAt; writeUser_(found.row, u); }
    else sheet_('Users').appendRow(USER_HEADERS.map(h => u[h]));
    sendTempMail_(email, temp, false);
    return { message: 'sent' };
  } finally { lock.releaseLock(); }
}

function login_(req) {
  const email = normEmail_(req.email);
  const found = findUser_(email);
  if (!found) throw apiError_('メールアドレスまたはパスワードが違います');
  const u = found.data;
  if (u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now()) {
    throw apiError_(`ログインに続けて失敗したため、${LOCK_MINUTES}分間ロックしています`);
  }
  if (!u.passHash) throw apiError_('この会員は RETRO ARCADE HUB 経由でご利用ください。パスワードでログインしたい場合は「パスワード再発行」から設定できます');
  if (hash_(u.salt, String(req.password || '')) !== u.passHash) {
    u.failCount = Number(u.failCount || 0) + 1;
    if (u.failCount >= MAX_FAIL) {
      u.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      u.failCount = 0;
    }
    writeUser_(found.row, u);
    throw apiError_('メールアドレスまたはパスワードが違います');
  }
  u.failCount = 0; u.lockedUntil = '';
  issueToken_(u);
  writeUser_(found.row, u);
  return { token: u.token, email: u.email, status: u.status };
}

// ================= RETRO ARCADE HUB 連携 =================
// チケット形式：base64url(JSON本文) + '.' + base64url(HMAC-SHA256(本文, HUB_SSO_SECRET))
function hubLogin_(req) {
  const secret = PROPS.getProperty('HUB_SSO_SECRET');
  if (!secret) throw apiError_('アーケードハブ連携の設定（HUB_SSO_SECRET）が未設定です');

  const parts = String(req.ticket || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw apiError_('入場チケットが正しくありません。アーケードハブからもう一度開いてください');
  const expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], secret));
  if (!safeEqual_(expected, parts[1])) throw apiError_('入場チケットが正しくありません。アーケードハブからもう一度開いてください');

  let p;
  try {
    p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));
  } catch (err) {
    throw apiError_('入場チケットを読み取れませんでした');
  }
  const now = Date.now();
  if (p.aud !== HUB_SSO.aud) throw apiError_('このゲーム用の入場チケットではありません');
  if (!(Number(p.exp) > now)) throw apiError_('入場チケットの有効期限が切れました。アーケードハブからもう一度開いてください');
  if (Number(p.iat) > now + HUB_SSO.maxClockSkewMs) throw apiError_('入場チケットの時刻が正しくありません');
  const mid = String(p.mid || '').replace(/[^A-Za-z0-9]/g, '');
  if (!mid || !p.nonce) throw apiError_('入場チケットが正しくありません');

  // 使い捨て：同じチケットの再利用を防ぐ
  const cache = CacheService.getScriptCache();
  const nonceKey = HUB_SSO.noncePrefix + String(p.nonce).replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
  if (cache.get(nonceKey)) throw apiError_('この入場チケットは使用済みです。アーケードハブからもう一度開いてください');
  cache.put(nonceKey, '1', HUB_SSO.nonceSec);

  const mail = normEmail_(p.email);
  const key = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : normEmail_(HUB_SSO.idPrefix + mid);
  const nickname = String(p.nick || '').trim().slice(0, 20);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let found = findUser_(key);
    let u;
    if (found) {
      u = found.data;
      // 仮パスワードのまま本パスワード未設定の会員は、ハブ会員として扱う（仮パスワードは無効化）
      if (u.status !== 'active') { u.status = 'hub'; u.passHash = ''; u.salt = ''; }
      u.failCount = 0; u.lockedUntil = '';
    } else {
      u = {
        email: key, passHash: '', salt: '', status: 'hub',
        token: '', tokenExpires: '', createdAt: new Date(), lastLogin: '', failCount: 0, lockedUntil: '',
      };
      sheet_('Users').appendRow(USER_HEADERS.map(h => u[h]));
      found = findUser_(key);
    }
    issueToken_(u);
    writeUser_(found.row, u);
    return { token: u.token, email: u.email, status: u.status, nickname, viaHub: true };
  } finally { lock.releaseLock(); }
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function verify_(req) {
  const u = requireUser_(req);
  return { email: u.data.email, status: u.data.status };
}

function changePassword_(req) {
  const found = requireUser_(req);
  const pw = String(req.newPassword || '');
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw apiError_('英字と数字を含む8文字以上にしてください');
  const u = found.data;
  u.salt = Utilities.getUuid();
  u.passHash = hash_(u.salt, pw);
  u.status = 'active';
  writeUser_(found.row, u);
  return { status: 'active' };
}

function resetPassword_(req) {
  const email = normEmail_(req.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw apiError_('メールアドレスの形式が正しくありません');
  const found = findUser_(email);
  // 登録有無は返さない（なりすまし調査対策）
  if (found) {
    const u = found.data;
    const temp = tempPassword_();
    u.salt = Utilities.getUuid();
    u.passHash = hash_(u.salt, temp);
    u.status = 'temporary';
    u.token = ''; u.tokenExpires = '';
    u.failCount = 0; u.lockedUntil = '';
    writeUser_(found.row, u);
    sendTempMail_(email, temp, true);
  }
  return { message: 'sent' };
}

function logout_(req) {
  const found = findUserByToken_(req.token);
  if (found) { found.data.token = ''; found.data.tokenExpires = ''; writeUser_(found.row, found.data); }
  return {};
}

// ================= 成績 =================
function getProgress_(req) {
  const u = requireActive_(req);
  const values = sheet_('Results').getDataRange().getValues();
  const progress = {};
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === u.data.email) progress[values[i][1]] = { bestMs: Number(values[i][2]), mistakes: Number(values[i][3]) };
  }
  return { progress };
}

function saveResult_(req) {
  const u = requireActive_(req);
  const stage = Number(req.stage), timeMs = Number(req.timeMs), mistakes = Number(req.mistakes);
  if (!(stage > 0) || !(timeMs > 0)) throw apiError_('記録が正しくありません');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_('Results');
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === u.data.email && Number(values[i][1]) === stage) {
        const best = Math.min(Number(values[i][2]) || timeMs, timeMs);
        const bestMiss = best === timeMs ? mistakes : values[i][3];
        sh.getRange(i + 1, 3, 1, 4).setValues([[best, bestMiss, Number(values[i][4] || 0) + 1, new Date()]]);
        return { bestMs: best };
      }
    }
    sh.appendRow([u.data.email, stage, timeMs, mistakes, 1, new Date()]);
    return { bestMs: timeMs };
  } finally { lock.releaseLock(); }
}

// ================= Gemini（テキスト） =================
const MIKE_PERSONA =
  'あなたは猫パズル「ねこならべ」の案内役、三毛猫の「ミケ先生」です。' +
  'やさしく、語尾にときどき「ニャ」を付けて話します。絵文字や記号の装飾は使いません。';

function gemini_(prompt, maxTokens) {
  const key = PROPS.getProperty('GEMINI_API_KEY');
  if (!key) throw apiError_('GEMINI_API_KEY が未設定です');
  const model = PROPS.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: maxTokens || 300, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (res.getResponseCode() !== 200) throw apiError_('AIの応答に失敗しました');
  const data = JSON.parse(res.getContentText());
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  return parts.map(p => p.text || '').join('').trim();
}

function hint_(req) {
  requireActive_(req);
  const i = req.info || {};
  const prompt =
    MIKE_PERSONA + '\n' +
    'プレイヤーが行き詰まっています。次の分析結果をもとに、どこに着目すべきかを2文以内でヒントしてください。' +
    '正解のマスそのもの（何行目の何列目か）は絶対に言わないでください。\n' +
    `ルール: 8×8の盤面。各行・各列・各色ブロックに猫が1匹ずつ。猫どうしは周囲8マスで隣接禁止。\n` +
    `置いた猫の数: ${Number(i.catsPlaced) || 0}/8\n` +
    `着目先: ${String(i.name || '').slice(0, 30)}（種類: ${String(i.kind || '').slice(0, 10)}）\n` +
    `そこに猫を置ける候補マス数: ${Number(i.candidates) || 0}\n` +
    (i.pattern ? `気づいてほしい点: ${String(i.pattern).slice(0, 80)}\n` : '');
  return { text: gemini_(prompt, 200) };
}

function praise_(req) {
  requireActive_(req);
  const stage = Number(req.stage), sec = Number(req.timeSec), miss = Number(req.mistakes);
  const prompt =
    MIKE_PERSONA + '\n' +
    `プレイヤーがステージ${stage}をクリアしました。タイムは${Math.floor(sec / 60)}分${sec % 60}秒、ミスは${miss}回です。` +
    'タイムやミスの少なさに具体的に触れながら、心からほめる言葉を2文、60文字程度で。' +
    (miss === 0 ? 'ノーミスだったことを特にたたえてください。' : '');
  return { text: gemini_(prompt, 200) };
}

// ================= Gemini TTS（Drive キャッシュ） =================
function tts_(req) {
  requireActive_(req);
  return ttsCore_(req.text);
}

function ttsCore_(rawText) {
  const text = String(rawText || '').slice(0, 160);
  if (!text) throw apiError_('読み上げる文章がありません');
  const voice = PROPS.getProperty('TTS_VOICE') || 'Leda';
  const keyHex = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, voice + '|' + text, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  const name = `tts_${keyHex}.json`;
  const folder = DriveApp.getFolderById(PROPS.getProperty('DRIVE_FOLDER_ID'));

  const hit = folder.getFilesByName(name);
  if (hit.hasNext()) return JSON.parse(hit.next().getBlob().getDataAsString());

  const key = PROPS.getProperty('GEMINI_API_KEY');
  if (!key) throw apiError_('GEMINI_API_KEY が未設定です');
  const model = PROPS.getProperty('GEMINI_TTS_MODEL') || 'gemini-2.5-flash-preview-tts';
  const res = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      contents: [{ parts: [{ text: '明るくかわいい猫のキャラクターの声で読んでください: ' + text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  if (res.getResponseCode() !== 200) throw apiError_('音声の生成に失敗しました');
  const data = JSON.parse(res.getContentText());
  const part = ((((data.candidates || [])[0] || {}).content || {}).parts || []).find(p => p.inlineData);
  if (!part) throw apiError_('音声の生成に失敗しました');
  const mime = part.inlineData.mimeType || '';
  const m = mime.match(/rate=(\d+)/);
  const out = { audio: part.inlineData.data, sampleRate: m ? Number(m[1]) : 24000 };
  folder.createFile(name, JSON.stringify(out), 'application/json');
  return out;
}

// よく使うセリフを事前に Drive へキャッシュ（任意・エディタから実行）
function warmUpVoices() {
  ['ニャー！スタート！', 'あらら…お魚がなくなっちゃったニャ。もう一回やってみよう！'].forEach(t => {
    try { ttsCore_(t); Logger.log('OK: ' + t); } catch (e) { Logger.log('NG: ' + t + ' ' + e.message); }
  });
}
