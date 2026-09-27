'use strict';

const params = new URLSearchParams(location.search);
document.getElementById('heading').textContent = params.get('heading') || '';
document.getElementById('task').textContent = params.get('task') || '';
document.getElementById('detail').textContent = params.get('detail') || '';

document.getElementById('yes').onclick = () => window.alertApi.answer('yes');
document.getElementById('no').onclick = () => window.alertApi.answer('no');
document.getElementById('close').onclick = () => window.alertApi.answer('dismiss');

window.alertApi.resize(document.getElementById('wrap').offsetHeight);

function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.18;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {}
}
chime();
