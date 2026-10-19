/**
 * 画面遷移・認証UI・ステージ選択・モーダル
 */
const App = (() => {
  const $ = id => document.getElementById(id);
  let progress = {};   // { stage: { bestMs, mistakes } }

  // ---------- 共通 ----------
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    document.body.dataset.screen = id;
    window.scrollTo(0, 0);
  }

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function setBusy(btn, busy, label) {
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || '送信中…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function msg(id, text, isError = true) {
    const m = $(id); m.textContent = text || ''; m.classList.toggle('ok', !isError);
  }

  // パスワード表示切替（目のアイコン）
  const EYE_OPEN = '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.1-5.9M9.9 5.2A9.5 9.5 0 0 1 12 5c7 0 11 7 11 7a18.6 18.6 0 0 1-2.2 3.2M14.1 14.2a3 3 0 1 1-4.2-4.2"/><path d="M1 1l22 22"/></svg>';
  function setupEyes() {
    document.querySelectorAll('.pw-field').forEach(f => {
      const input = f.querySelector('input');
      const btn = f.querySelector('.eye');
      btn.innerHTML = EYE_OPEN;
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = show ? EYE_OFF : EYE_OPEN;
        btn.setAttribute('aria-label', show ? 'パスワードを隠す' : 'パスワードを表示');
      });
    });
  }

  // 背景動画（Google Earth Studio 書き出し）
  function setupVideo(video, src) {
    if (!video || !src) return;
    video.src = src;
    video.addEventListener('error', () => video.classList.add('failed'), { once: true });
    video.addEventListener('loadeddata', () => video.classList.add('ready'), { once: true });
    const p = video.play(); if (p) p.catch(() => {});
  }

  // ---------- 認証 ----------
  function showAuthPanel(name) {
    ['login', 'register', 'reset'].forEach(n => { $(`panel-${n}`).hidden = n !== name; });
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === name));
    msg('authMsg', '');
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = $('btnLogin');
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    if (!email || !password) return msg('authMsg', 'メールアドレスとパスワードを入力してください');
    setBusy(btn, true, 'ログイン中…');
    try {
      const r = await Api.call('login', { email, password });
      Session.set({ token: r.token, email: r.email, status: r.status });
      $('loginPassword').value = '';
      afterAuth(r.status);
    } catch (err) { msg('authMsg', err.message); }
    finally { setBusy(btn, false); }
  }

  async function doRegister(e) {
    e.preventDefault();
    const btn = $('btnRegister');
    const email = $('regEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('authMsg', 'メールアドレスの形式が正しくありません');
    setBusy(btn, true);
    try {
      await Api.call('register', { email });
      msg('authMsg', '仮パスワードをメールで送りました。届いたパスワードでログインしてください。', false);
      $('loginEmail').value = email;
      setTimeout(() => { showAuthPanel('login'); msg('authMsg', '仮パスワードでログインしてください', false); }, 2500);
    } catch (err) { msg('authMsg', err.message); }
    finally { setBusy(btn, false); }
  }

  async function doReset(e) {
    e.preventDefault();
    const btn = $('btnReset2');
    const email = $('resetEmail').value.trim();
    if (!email) return msg('authMsg', 'メールアドレスを入力してください');
    setBusy(btn, true);
    try {
      await Api.call('resetPassword', { email });
      msg('authMsg', '登録済みのアドレスなら、新しい仮パスワードを送りました。', false);
      $('loginEmail').value = email;
    } catch (err) { msg('authMsg', err.message); }
    finally { setBusy(btn, false); }
  }

  async function doChangePassword(e) {
    e.preventDefault();
    const btn = $('btnChangePw');
    const p1 = $('newPw').value, p2 = $('newPw2').value;
    if (p1.length < 8 || !/[A-Za-z]/.test(p1) || !/\d/.test(p1)) return msg('pwMsg', '英字と数字を含む8文字以上にしてください');
    if (p1 !== p2) return msg('pwMsg', '確認用パスワードが一致しません');
    setBusy(btn, true, '変更中…');
    try {
      await Api.call('changePassword', { newPassword: p1 });
      const s = Session.get(); s.status = 'active'; Session.set(s);
      $('newPw').value = ''; $('newPw2').value = '';
      closeModal('modalChangePw');
      toast('パスワードを変更しました');
      enterStages();
    } catch (err) { msg('pwMsg', err.message); }
    finally { setBusy(btn, false); }
  }

  function afterAuth(status) {
    if (status === 'temporary') {
      msg('pwMsg', '');
      openModal('modalChangePw');
    } else {
      enterStages();
    }
  }

  async function logout() {
    try { await Api.call('logout'); } catch (e) {}
    Session.clear();
    Game.stop();
    closeModal('modalSettings');
    showScreen('screenAuth');
    showAuthPanel('login');
  }

  // ---------- ステージ選択 ----------
  async function enterStages() {
    const s = Session.get();
    $('userEmail').textContent = s ? s.email : '';
    showScreen('screenStages');
    renderStages();
    try {
      const r = await Api.call('getProgress');
      progress = r.progress || {};
      renderStages();
    } catch (e) { toast(e.message); }
  }

  function isUnlocked(n) { return n === 1 || !!progress[n - 1] || !!progress[n]; }

  function renderStages() {
    const grid = $('stageGrid');
    grid.innerHTML = '';
    const cleared = Object.keys(progress).length;
    $('clearedCount').textContent = `${cleared} / ${APP_CONFIG.STAGE_COUNT} ステージクリア`;
    for (let n = 1; n <= APP_CONFIG.STAGE_COUNT; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      const p = progress[n];
      const open = isUnlocked(n);
      b.className = 'stage-btn' + (p ? ' cleared' : '') + (open ? '' : ' locked');
      b.disabled = !open;
      b.innerHTML = `<span class="no">${n}</span>` +
        (p ? `<span class="best">${fmt(p.bestMs)}</span><span class="paw" aria-hidden="true">🐾</span>` :
          open ? '<span class="best">挑戦</span>' : '<span class="best">🔒</span>');
      b.setAttribute('aria-label', `ステージ${n}${p ? ' クリア済み' : open ? '' : ' 未開放'}`);
      b.addEventListener('click', () => playStage(n));
      grid.appendChild(b);
    }
  }

  function fmt(ms) {
    const s = Math.floor((ms || 0) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function playStage(n) {
    closeModal('modalClear'); closeModal('modalGameOver');
    showScreen('screenGame');
    Game.start(n);
  }

  // ---------- クリア / ゲームオーバー ----------
  async function showClear({ stage, timeMs, mistakes, timeText }) {
    $('clearStage').textContent = `ステージ ${stage} クリア！`;
    $('clearTime').textContent = timeText;
    $('clearMiss').textContent = `${mistakes}回`;
    $('clearPraise').textContent = 'ミケ先生がコメントを考え中…';
    $('btnNext').hidden = stage >= APP_CONFIG.STAGE_COUNT;
    $('btnNext').onclick = () => playStage(stage + 1);
    openModal('modalClear');
    const v = $('clearVideo'); if (v && v.src) { v.currentTime = 0; v.play().catch(() => {}); }

    const prev = progress[stage];
    if (!prev || timeMs < prev.bestMs) progress[stage] = { bestMs: timeMs, mistakes };
    Api.call('saveResult', { stage, timeMs, mistakes }).catch(e => toast(e.message));

    let praise = `すごいニャ！ステージ${stage}を${timeText}でクリア！`;
    try {
      const r = await Api.call('praise', { stage, timeSec: Math.round(timeMs / 1000), mistakes });
      if (r.text) praise = r.text;
    } catch (e) {}
    $('clearPraise').textContent = praise;
    Sound.say(praise);
  }

  function showGameOver(stage) {
    $('btnRetry').onclick = () => playStage(stage);
    openModal('modalGameOver');
  }

  // ---------- 設定 ----------
  function openSettings() {
    $('setAutoX').checked = Settings.get('autoX');
    $('setSound').checked = Settings.get('sound');
    const s = Session.get();
    $('setEmail').textContent = s ? s.email : '';
    openModal('modalSettings');
  }

  // ---------- 起動 ----------
  async function init() {
    document.title = APP_CONFIG.APP_NAME;
    $('version').textContent = APP_CONFIG.VERSION;
    $('setVersion').textContent = APP_CONFIG.VERSION;
    setupEyes();
    setupVideo($('bgVideo'), APP_CONFIG.BG_VIDEO_URL);
    setupVideo($('clearVideo'), APP_CONFIG.CLEAR_VIDEO_URL);
    Game.init();

    document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => showAuthPanel(t.dataset.panel)));
    $('linkForgot').addEventListener('click', () => showAuthPanel('reset'));
    $('linkBackLogin').addEventListener('click', () => showAuthPanel('login'));
    $('formLogin').addEventListener('submit', doLogin);
    $('formRegister').addEventListener('submit', doRegister);
    $('formReset').addEventListener('submit', doReset);
    $('formChangePw').addEventListener('submit', doChangePassword);

    document.querySelectorAll('[data-open-settings]').forEach(b => b.addEventListener('click', openSettings));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
    $('btnBackStages').addEventListener('click', () => { Game.stop(); enterStages(); });
    $('btnToStages').addEventListener('click', () => { closeModal('modalClear'); enterStages(); });
    $('btnGoStages').addEventListener('click', () => { closeModal('modalGameOver'); enterStages(); });
    $('btnLogout').addEventListener('click', logout);
    $('setAutoX').addEventListener('change', e => { Settings.set('autoX', e.target.checked); Game.refresh(); });
    $('setSound').addEventListener('change', e => Settings.set('sound', e.target.checked));
    $('btnHowto').addEventListener('click', () => { closeModal('modalSettings'); openModal('modalHowto'); });

    window.addEventListener('auth-expired', () => {
      Game.stop();
      showScreen('screenAuth'); showAuthPanel('login');
      msg('authMsg', 'ログインの有効期限が切れました。もう一度ログインしてください');
    });

    // セッション復元
    const s = Session.get();
    if (s && s.token) {
      try {
        const r = await Api.call('verify');
        Session.set({ token: s.token, email: r.email, status: r.status });
        afterAuth(r.status);
        return;
      } catch (e) { /* 無効なら下でログイン画面 */ }
    }
    showScreen('screenAuth');
    showAuthPanel('login');
  }

  return { init, showClear, showGameOver, toast };
})();

document.addEventListener('DOMContentLoaded', App.init);
