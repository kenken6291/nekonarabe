/**
 * GAS API 通信 & セッション管理
 * text/plain で POST することで CORS プリフライトを回避
 */
const Session = (() => {
  const KEY = 'nekonarabe_session';
  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function set(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }
  function token() { const s = get(); return s ? s.token : ''; }
  return { get, set, clear, token };
})();

const Api = (() => {
  async function call(action, data = {}) {
    const url = APP_CONFIG.GAS_API_URL;
    if (!url || url.includes('XXXX')) throw new Error('config.js の GAS_API_URL を設定してください');
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action, token: Session.token() }, data)),
      });
    } catch (e) {
      throw new Error('サーバーに接続できません。通信環境を確認してください');
    }
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('サーバーの応答を読み取れませんでした'); }
    if (!json.ok) {
      if (json.code === 'AUTH') {
        Session.clear();
        window.dispatchEvent(new CustomEvent('auth-expired'));
      }
      throw new Error(json.error || 'エラーが発生しました');
    }
    return json;
  }
  return { call };
})();
