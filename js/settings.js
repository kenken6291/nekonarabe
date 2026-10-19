/**
 * 端末ごとの設定（自動×・サウンド）
 */
const Settings = (() => {
  const KEY = 'nekonarabe_settings';
  const defaults = { autoX: true, sound: true };
  let data = Object.assign({}, defaults);
  try { data = Object.assign(data, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
  function get(k) { return data[k]; }
  function set(k, v) {
    data[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
  return { get, set };
})();
