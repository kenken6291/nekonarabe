/**
 * 音声まわり
 *  - say(): Gemini TTS（GAS経由・Driveキャッシュ）→ 失敗時はブラウザ音声合成
 *  - sfx(): WebAudio による短い効果音
 */
const Sound = (() => {
  const cache = new Map();
  let ctx = null;
  let current = null;

  function enabled() { return Settings.get('sound'); }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // 16bit モノラル PCM → WAV
  function pcmToWav(pcm, sampleRate) {
    const buf = new ArrayBuffer(44 + pcm.length);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, pcm.length, true);
    new Uint8Array(buf, 44).set(pcm);
    return buf;
  }

  function browserSay(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; u.pitch = 1.4; u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  async function say(text) {
    if (!enabled() || !text) return;
    if (!APP_CONFIG.TTS_ENABLED) { browserSay(text); return; }
    try {
      let url = cache.get(text);
      if (!url) {
        const r = await Api.call('tts', { text });
        const wav = pcmToWav(b64ToBytes(r.audio), r.sampleRate || 24000);
        url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
        cache.set(text, url);
      }
      if (current) current.pause();
      current = new Audio(url);
      await current.play();
    } catch (e) {
      console.warn('TTS fallback:', e.message);
      browserSay(text);
    }
  }

  function tone(freq, dur, type = 'sine', gain = 0.12, delay = 0) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
    } catch (e) {}
  }

  function sfx(kind) {
    if (!enabled()) return;
    if (kind === 'tap') tone(520, 0.06, 'triangle', 0.06);
    if (kind === 'cat') { tone(660, 0.08, 'sine'); tone(990, 0.12, 'sine', 0.1, 0.07); }
    if (kind === 'miss') { tone(220, 0.18, 'sawtooth', 0.08); tone(160, 0.25, 'sawtooth', 0.08, 0.12); }
    if (kind === 'clear') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.1, i * 0.12));
  }

  return { say, sfx };
})();
