'use strict';
/* =========================================================
   Memoriz · Livre d'or vidéo (photobooth vidéo pour tablette)
   ========================================================= */
const APP_VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const slug = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'et')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'evenement';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const fmtDur = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
const fmtSize = b => b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : (b / 1e6).toFixed(1) + ' Mo';
const fmtDate = t => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

const FONTS_TITLE = ['Cormorant Garamond', 'Playfair Display', 'Great Vibes', 'Parisienne', 'Cinzel', 'Montserrat'];
const FONTS_BODY = ['Montserrat', 'Poppins', 'Lato', 'Raleway'];
const DEFAULT_PROMPTS = [
  'Un souvenir avec les mariés qui vous fait encore rire',
  'Votre meilleur conseil pour une vie de couple réussie',
  'Ce que vous leur souhaitez pour les années à venir',
  'Racontez comment vous les avez rencontrés',
  'Une déclaration, une chanson, un fou rire… lâchez-vous !',
];

function defaultEvent() {
  return {
    id: uid(), name: 'Mariage Sarah & Yanis', createdAt: Date.now(),
    eyebrow: 'Livre d’or vidéo', title: 'Sarah & Yanis', subtitle: '12 juillet 2027',
    welcome: 'Un mot, un souvenir, un fou rire : laissez-nous un message vidéo !',
    startLabel: 'Laisser un message', thanksTitle: 'Merci {prenom} !',
    thanksText: 'Votre message a bien été enregistré. Les mariés le découvriront très bientôt.',
    colors: { bg: '#D9D5D2', primary: '#6B2737', text: '#2B1A1E', onPrimary: '#FFFFFF' },
    fontTitle: 'Cormorant Garamond', fontBody: 'Montserrat',
    bgAsset: null, logoAsset: null, frameAsset: null, bgDim: 0.35,
    askName: true, promptMode: 'choice', prompts: [...DEFAULT_PROMPTS],
    countdown: 3, maxDuration: 60, minDuration: 3, review: true, maxRetakes: 2, thanksDelay: 6,
    overlayTitle: true, overlayLogo: false, overlayFrame: true, showSignature: true,
  };
}
const DEFAULT_SETTINGS = {
  pin: '1234', activeEventId: null, cameraId: '', micId: '', resolution: '1080', orientation: 'auto',
  rotation: 0, mirror: true, bitrate: 6000000, noiseSuppression: true, autoGainControl: true,
  echoCancellation: false, autoDownload: true, idleTimeout: 45, autoFullscreen: true, wakeLock: true,
  blockBack: true, sounds: true,
};

const S = {
  settings: null, events: [], event: null, screen: null, assets: {},
  media: { stream: null, error: null, warning: null, devices: [], video: null },
  audio: { ctx: null, src: null, analyser: null, data: null, level: 0 },
  guest: null, rec: { active: false }, pending: null,
  lastActivity: Date.now(), adminOpen: false, thanksTimer: null, wakeLock: null,
};

/* ---------------- Sauvegarde ---------------- */
const saveSettings = debounce(() => DB.put('kv', S.settings, 'settings'), 250);
const saveEvents = debounce(() => DB.put('kv', S.events, 'events'), 250);
const applyEventSoon = debounce(() => applyEvent(), 150);

function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

/* ================= Démarrage ================= */
async function init() {
  S.media.video = $('#cam');
  S.settings = Object.assign({}, DEFAULT_SETTINGS, await DB.get('kv', 'settings'));
  const base = defaultEvent();
  S.events = ((await DB.get('kv', 'events')) || []).map(e => ({ ...base, ...e, colors: { ...base.colors, ...e.colors } }));
  if (!S.events.length) { S.events.push(base); S.settings.activeEventId = base.id; }
  S.event = S.events.find(e => e.id === S.settings.activeEventId) || S.events[0];
  S.settings.activeEventId = S.event.id;
  await DB.put('kv', S.events, 'events'); await DB.put('kv', S.settings, 'settings');

  fillFontSelects();
  await applyEvent();
  bindGuest(); bindAdmin(); bindLock();
  show('home');
  requestAnimationFrame(loop);
  setInterval(idleCheck, 1000);
  window.addEventListener('resize', () => resizePreview());
  startMedia().catch(err => mediaFailed(err));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ================= Thème / événement ================= */
async function applyEvent() {
  const e = S.event, st = document.documentElement.style;
  st.setProperty('--bg', e.colors.bg); st.setProperty('--primary', e.colors.primary);
  st.setProperty('--text', e.colors.text); st.setProperty('--on-primary', e.colors.onPrimary);
  st.setProperty('--font-title', `"${e.fontTitle}", Georgia, serif`);
  st.setProperty('--font-body', `"${e.fontBody}", system-ui, sans-serif`);
  $$('[data-t]').forEach(el => { el.textContent = e[el.dataset.t] || ''; });
  $('.subtitle-row').hidden = !e.subtitle; $('.eyebrow[data-t]').hidden = !e.eyebrow; $('.welcome[data-t]').hidden = !e.welcome;
  await Promise.all([loadAsset('bg', e.bgAsset), loadAsset('logo', e.logoAsset), loadAsset('frame', e.frameAsset)]);
  $('#bg').style.backgroundImage = S.assets.bg ? `url("${S.assets.bg.url}")` : 'none';
  $('#bg-dim').style.opacity = S.assets.bg ? e.bgDim : 0;
  const logo = $('#home-logo');
  if (S.assets.logo) { logo.src = S.assets.logo.url; logo.hidden = false; } else { logo.hidden = true; logo.removeAttribute('src'); }
  $('#signature').hidden = !e.showSignature;
  $('#adm-active-name').textContent = e.name;
  document.fonts?.load(`600 40px "${e.fontTitle}"`).catch(() => {});
  document.fonts?.load(`400 20px "${e.fontBody}"`).catch(() => {});
}
async function loadAsset(slot, key) {
  const cur = S.assets[slot];
  if (cur && cur.key === key) return;
  if (cur) URL.revokeObjectURL(cur.url);
  S.assets[slot] = null;
  if (!key) return;
  const blob = await DB.get('assets', key);
  if (!blob) return;
  const url = URL.createObjectURL(blob), img = new Image();
  img.src = url;
  try { await img.decode(); } catch { }
  S.assets[slot] = { key, url, img };
}
const fillText = t => (t || '').replace(/\{prenom\}/gi, S.guest?.name || '').replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();

/* ================= Navigation invité ================= */
function show(name) {
  S.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 's-' + name));
  if (name === 'booth') resizePreview();
  touch();
}
function touch() { S.lastActivity = Date.now(); }

function bindGuest() {
  $('#btn-start').addEventListener('click', startFlow);
  $('#btn-name-next').addEventListener('click', () => { S.guest.name = $('#guest-name').value.trim().slice(0, 40); $('#guest-name').blur(); goPrompt(); });
  $('#btn-name-skip').addEventListener('click', () => { S.guest.name = ''; $('#guest-name').blur(); goPrompt(); });
  $('#guest-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-name-next').click(); });
  $('#btn-prompt-back').addEventListener('click', () => S.event.askName ? show('name') : goHome());
  $('#btn-booth-back').addEventListener('click', () => {
    if (S.event.promptMode === 'choice' && S.event.prompts.length) show('prompt');
    else if (S.event.askName) show('name'); else goHome();
  });
  $('#btn-reroll').addEventListener('click', () => { S.guest.prompt = randomPrompt(S.guest.prompt); $('#booth-q').textContent = S.guest.prompt; });
  $('#btn-rec').addEventListener('click', startCountdown);
  $('#btn-stop').addEventListener('click', stopRecording);
  $('#btn-retake').addEventListener('click', () => { S.guest.retakes++; discardPending(); goBooth(); });
  $('#btn-validate').addEventListener('click', () => savePending());
  $('#btn-replay').addEventListener('click', () => { const v = $('#review-video'); v.currentTime = 0; v.play().catch(() => {}); });
  $('#review-video').addEventListener('play', () => ($('#btn-replay').hidden = true));
  $('#review-video').addEventListener('ended', () => ($('#btn-replay').hidden = false));
  $('#review-video').addEventListener('pause', () => ($('#btn-replay').hidden = false));
}

function startFlow() {
  resumeAudio(); requestFullscreen(); acquireWakeLock();
  if (!S.media.stream || !S.media.stream.getVideoTracks().some(t => t.readyState === 'live')) {
    toast('La caméra n’est pas prête. Merci de prévenir l’organisateur.');
    startMedia().catch(err => mediaFailed(err));
    return;
  }
  S.guest = { name: '', prompt: '', retakes: 0 };
  $('#guest-name').value = '';
  if (S.event.askName) { show('name'); } else goPrompt();
}
function randomPrompt(not) {
  const ps = S.event.prompts.filter(Boolean);
  if (ps.length < 2) return ps[0] || '';
  let p; do { p = ps[Math.floor(Math.random() * ps.length)]; } while (p === not);
  return p;
}
function goPrompt() {
  const ps = S.event.prompts.filter(Boolean);
  if (S.event.promptMode === 'none' || !ps.length) { S.guest.prompt = ''; return goBooth(); }
  if (S.event.promptMode === 'random') { S.guest.prompt = randomPrompt(); return goBooth(); }
  const box = $('#prompt-list'); box.innerHTML = '';
  ps.forEach(p => {
    const b = document.createElement('button'); b.className = 'prompt-card'; b.textContent = p;
    b.onclick = () => { S.guest.prompt = p; goBooth(); };
    box.appendChild(b);
  });
  const f = document.createElement('button'); f.className = 'prompt-card free'; f.textContent = 'Message libre, sans question';
  f.onclick = () => { S.guest.prompt = ''; goBooth(); };
  box.appendChild(f);
  show('prompt');
}
function goBooth() {
  $('#booth-q').textContent = S.guest.prompt;
  $('#btn-reroll').hidden = S.event.promptMode !== 'random' || S.event.prompts.length < 2;
  setBoothState('ready');
  show('booth');
}
function goHome() {
  clearTimeout(S.thanksTimer);
  if (S.rec.active) return;
  S.guest = null; discardPending();
  show('home');
}
function setBoothState(st) { $('#s-booth').dataset.state = st; S.boothState = st; }

/* ================= Caméra / micro ================= */
async function startMedia() {
  stopMedia();
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Ce navigateur ne donne pas accès à la caméra (il faut une adresse https).'), { name: 'Unsupported' });
  const s = S.settings, hd = s.resolution === '1080';
  const video = { width: { ideal: hd ? 1920 : 1280 }, height: { ideal: hd ? 1080 : 720 }, frameRate: { ideal: 30 } };
  const audio = { echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGainControl, channelCount: { ideal: 1 } };
  if (s.cameraId) video.deviceId = { exact: s.cameraId };
  if (s.micId) audio.deviceId = { exact: s.micId };
  const warn = [];
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video, audio });
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') throw err;
    if (s.cameraId || s.micId) {
      delete video.deviceId; delete audio.deviceId;
      warn.push('Le périphérique choisi est introuvable : la caméra / le micro par défaut sont utilisés. Vérifie le branchement.');
    }
    try { stream = await navigator.mediaDevices.getUserMedia({ video, audio }); }
    catch (err2) {
      if (err2.name === 'NotAllowedError') throw err2;
      stream = await navigator.mediaDevices.getUserMedia({ video });
      warn.push('Aucun micro détecté : les vidéos seront muettes !');
    }
  }
  S.media.stream = stream; S.media.error = null; S.media.warning = warn.join(' ') || null;
  const v = S.media.video; v.srcObject = stream;
  await v.play().catch(() => {});
  stream.getTracks().forEach(t => { t.onended = () => { if (S.media.stream === stream) restartMediaSoon(); }; });
  setupAudioMeter(stream);
  await refreshDevices();
  updateStatus();
  if (S.adminOpen) { $('#adm-video').srcObject = stream; updateAvInfo(); }
}
function stopMedia() {
  if (S.media.stream) S.media.stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
  S.media.stream = null;
}
const restartMediaSoon = debounce(() => { if (!S.rec.active) startMedia().catch(err => mediaFailed(err)); }, 1200);
function mediaFailed(err) {
  console.error(err);
  S.media.error = err.name === 'NotAllowedError'
    ? 'Accès à la caméra / au micro refusé. Autorise-le dans les réglages du site (icône à gauche de l’adresse).'
    : (err.message || err.name || 'Erreur caméra');
  updateStatus(); updateAvInfo();
}
function updateStatus() {
  const d = $('#status-dot');
  d.classList.toggle('bad', !!S.media.error || !S.media.stream);
  d.classList.toggle('warn', !S.media.error && !!S.media.warning);
  d.title = S.media.error || S.media.warning || '';
}
async function refreshDevices() {
  try { S.media.devices = await navigator.mediaDevices.enumerateDevices(); } catch { S.media.devices = []; }
  fillDeviceSelect($('#sel-cam'), 'videoinput', 'cameraId', 'Caméra');
  fillDeviceSelect($('#sel-mic'), 'audioinput', 'micId', 'Micro');
}
function fillDeviceSelect(sel, kind, key, label) {
  const list = S.media.devices.filter(d => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const opts = [`<option value="">Par défaut du système</option>`].concat(list.map((d, i) =>
    `<option value="${esc(d.deviceId)}">${esc(d.label || `${label} ${i + 1}`)}${/usb|external|externe/i.test(d.label) ? '  · USB' : ''}</option>`));
  sel.innerHTML = opts.join('');
  sel.value = list.some(d => d.deviceId === S.settings[key]) ? S.settings[key] : '';
}
navigator.mediaDevices?.addEventListener?.('devicechange', () => {
  refreshDevices();
  // Une caméra/un micro USB vient d'être branché ou débranché : on relance si on est sur les appareils par défaut
  if (!S.rec.active) restartMediaSoon();
});

function setupAudioMeter(stream) {
  try {
    if (!stream.getAudioTracks().length) { S.audio.analyser = null; return; }
    const A = S.audio;
    if (!A.ctx) A.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (A.src) A.src.disconnect();
    A.src = A.ctx.createMediaStreamSource(stream);
    A.analyser = A.ctx.createAnalyser(); A.analyser.fftSize = 1024;
    A.src.connect(A.analyser);
    A.data = new Float32Array(A.analyser.fftSize);
  } catch (e) { console.warn(e); }
}
function resumeAudio() { if (S.audio.ctx?.state === 'suspended') S.audio.ctx.resume().catch(() => {}); }
function readLevel() {
  const A = S.audio;
  if (!A.analyser) return 0;
  A.analyser.getFloatTimeDomainData(A.data);
  let sum = 0; for (let i = 0; i < A.data.length; i++) sum += A.data[i] * A.data[i];
  const db = 20 * Math.log10(Math.sqrt(sum / A.data.length) + 1e-8);
  const lvl = Math.max(0, Math.min(1, (db + 55) / 50));
  A.level = A.level * 0.6 + lvl * 0.4;
  return A.level;
}
function beep(freq = 880, dur = 0.12) {
  if (!S.settings.sounds || !S.audio.ctx) return;
  try {
    const c = S.audio.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = freq; g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + 0.02);
  } catch { }
}

/* ================= Rendu (aperçu + vidéo enregistrée) ================= */
const pv = $('#pv'), pvCtx = pv.getContext('2d');
const recCanvas = document.createElement('canvas');
const recCtx = recCanvas.getContext('2d', { alpha: false });

function outputOrientation() {
  const o = S.settings.orientation;
  return o === 'auto' ? (innerHeight > innerWidth ? 'portrait' : 'landscape') : o;
}
function outputSize() {
  const hd = S.settings.resolution === '1080', L = hd ? 1920 : 1280, s = hd ? 1080 : 720;
  return outputOrientation() === 'portrait' ? { w: s, h: L } : { w: L, h: s };
}
function resizePreview() {
  const { w, h } = S.rec.active ? { w: recCanvas.width, h: recCanvas.height } : outputSize();
  const W = innerWidth, H = innerHeight, k = Math.min(W / w, H / h);
  const cw = Math.round(w * k), ch = Math.round(h * k), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  pv.style.width = cw + 'px'; pv.style.height = ch + 'px';
  pv.width = Math.round(cw * dpr); pv.height = Math.round(ch * dpr);
}
function drawVideoCover(ctx, W, H, mirror) {
  const v = S.media.video, vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
  const rot = (+S.settings.rotation || 0) % 360, sideways = rot % 180 !== 0;
  const sw = sideways ? vh : vw, sh = sideways ? vw : vh, k = Math.max(W / sw, H / sh);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  if (mirror) ctx.scale(-1, 1);
  ctx.rotate(rot * Math.PI / 180);
  ctx.drawImage(v, -vw * k / 2, -vh * k / 2, vw * k, vh * k);
  ctx.restore();
}
function drawOverlays(ctx, W, H) {
  const e = S.event, m = Math.min(W, H);
  if (e.overlayTitle && (e.title || e.subtitle)) {
    const g = ctx.createLinearGradient(0, H * 0.72, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = m * 0.02;
    const ts = m * 0.075, ss = m * 0.028;
    const base = H - m * (e.subtitle ? 0.075 : 0.05);
    if (e.title) { ctx.font = `400 ${ts}px "${e.fontTitle}", Georgia, serif`; ctx.fillText(e.title, W / 2, base - (e.subtitle ? ss * 1.6 : 0), W * 0.9); }
    if (e.subtitle) { ctx.font = `500 ${ss}px "${e.fontBody}", sans-serif`; ctx.fillText(e.subtitle.toUpperCase().split('').join(String.fromCharCode(8202)), W / 2, base + ss * 0.6, W * 0.9); }
    ctx.shadowBlur = 0;
  }
  if (e.overlayLogo && S.assets.logo?.img?.naturalWidth) {
    const img = S.assets.logo.img, lh = m * 0.13, lw = Math.min(lh * img.naturalWidth / img.naturalHeight, W * 0.3);
    const rh = lw * img.naturalHeight / img.naturalWidth;
    ctx.globalAlpha = 0.92; ctx.drawImage(img, W - lw - m * 0.04, m * 0.04, lw, rh); ctx.globalAlpha = 1;
  }
  if (e.overlayFrame && S.assets.frame?.img?.naturalWidth) ctx.drawImage(S.assets.frame.img, 0, 0, W, H);
}
function loop() {
  requestAnimationFrame(loop);
  if (S.screen === 'booth' && !S.adminOpen) {
    drawVideoCover(pvCtx, pv.width, pv.height, S.settings.mirror);
    drawOverlays(pvCtx, pv.width, pv.height);
  }
  if (S.rec.active || S.testRec) {
    drawVideoCover(recCtx, recCanvas.width, recCanvas.height, false);
    drawOverlays(recCtx, recCanvas.width, recCanvas.height);
  }
  if (S.screen === 'booth' || S.adminOpen) {
    const lvl = readLevel();
    $$('.meter i').forEach(i => { i.style.transform = `scaleX(${lvl.toFixed(3)})`; });
  }
  if (S.rec.active) updateRecUI();
}

/* ================= Enregistrement ================= */
function pickMime() {
  // H.264 + AAC en MP4 en priorité : lisible sur tous les téléphones, ordinateurs et logiciels de montage
  const c = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d0028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
    'video/mp4;codecs=avc3.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return (window.MediaRecorder && c.find(t => MediaRecorder.isTypeSupported(t))) || '';
}
async function startCountdown() {
  resumeAudio(); touch();
  setBoothState('countdown');
  const cd = $('#countdown'), n = Math.max(0, Math.round(S.event.countdown));
  for (let i = n; i > 0; i--) {
    if (S.screen !== 'booth') return;
    cd.innerHTML = `<span>${i}</span>`; beep(660);
    await sleep(1000);
  }
  if (S.screen !== 'booth') return;
  cd.innerHTML = ''; beep(990, 0.2);
  try { startRecording(); }
  catch (err) { console.error(err); toast('Impossible de démarrer l’enregistrement : ' + (err.message || err.name)); setBoothState('ready'); }
}
function makeRecorder(durationCap) {
  const { w, h } = outputSize();
  recCanvas.width = w; recCanvas.height = h;
  drawVideoCover(recCtx, w, h, false); drawOverlays(recCtx, w, h);
  const vTrack = recCanvas.captureStream(30).getVideoTracks()[0];
  const tracks = [vTrack, ...(S.media.stream?.getAudioTracks() || [])];
  const mime = pickMime();
  const opts = { videoBitsPerSecond: +S.settings.bitrate || 6000000, audioBitsPerSecond: 128000 };
  if (mime) opts.mimeType = mime;
  const mr = new MediaRecorder(new MediaStream(tracks), opts);
  const chunks = [];
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  return { mr, chunks, vTrack, mime: mr.mimeType || mime || 'video/webm', w, h };
}
function startRecording() {
  const r = makeRecorder();
  S.rec = { active: true, ...r, start: performance.now(), max: Math.max(5, +S.event.maxDuration || 60), stopping: false };
  r.mr.onstop = onRecorderStop;
  r.mr.onerror = e => { console.error(e); toast('Erreur pendant l’enregistrement.'); };
  r.mr.start(1000);
  $('#rec-max').textContent = '/ ' + fmtDur(S.rec.max);
  $('#btn-stop').disabled = true;
  resizePreview();
  setBoothState('recording');
}
function updateRecUI() {
  const el = (performance.now() - S.rec.start) / 1000;
  $('#rec-time').textContent = fmtDur(el);
  $('#rec-progress').style.transform = `scaleX(${Math.min(1, el / S.rec.max)})`;
  $('.progress').classList.toggle('ending', S.rec.max - el <= 10);
  $('#btn-stop').disabled = el < (+S.event.minDuration || 0);
  if (el >= S.rec.max && !S.rec.stopping) stopRecording();
}
function stopRecording() {
  if (!S.rec.active || S.rec.stopping) return;
  S.rec.stopping = true;
  S.rec.duration = (performance.now() - S.rec.start) / 1000;
  S.rec.thumb = makeThumb(recCanvas);
  try { S.rec.mr.requestData(); } catch { }
  S.rec.mr.stop();
  setBoothState('saving');
}
function makeThumb(src) {
  const c = document.createElement('canvas'), k = 320 / Math.max(src.width, src.height);
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.75));
}
async function onRecorderStop() {
  const r = S.rec;
  r.vTrack.stop();
  S.rec = { active: false };
  const blob = new Blob(r.chunks, { type: r.mime.split(';')[0] });
  const thumb = await r.thumb;
  if (!blob.size) { toast('L’enregistrement est vide, merci de recommencer.'); goBooth(); return; }
  S.pending = { blob, mime: r.mime, duration: r.duration, thumb, w: r.w, h: r.h };
  if (S.event.review) showReview(); else savePending();
}
function showReview() {
  const v = $('#review-video');
  if (S.pending.url) URL.revokeObjectURL(S.pending.url);
  S.pending.url = URL.createObjectURL(S.pending.blob);
  v.src = S.pending.url; v.currentTime = 0;
  const left = Math.max(0, (+S.event.maxRetakes || 0) - S.guest.retakes);
  $('#btn-retake').hidden = left <= 0;
  $('#retake-left').textContent = left > 0 ? `Vous pouvez recommencer encore ${left} fois.` : '';
  show('review');
  v.play().catch(() => ($('#btn-replay').hidden = false));
}
function discardPending() {
  const v = $('#review-video'); v.pause(); v.removeAttribute('src'); v.load();
  if (S.pending?.url) URL.revokeObjectURL(S.pending.url);
  S.pending = null;
}
async function savePending() {
  const p = S.pending; if (!p) return;
  S.pending = null;
  const v = $('#review-video'); v.pause();
  const ev = S.event, d = new Date(), ext = p.mime.includes('mp4') ? 'mp4' : 'webm';
  const fileName = `${slug(ev.name)}_${stamp(d)}${S.guest?.name ? '_' + slug(S.guest.name) : ''}.${ext}`;
  const rec = {
    id: uid(), eventId: ev.id, fileName, guestName: S.guest?.name || '', prompt: S.guest?.prompt || '',
    createdAt: d.getTime(), duration: p.duration, mime: p.mime, size: p.blob.size, blob: p.blob, thumb: p.thumb,
  };
  showThanks();
  if (p.url) setTimeout(() => URL.revokeObjectURL(p.url), 2000);
  try { await DB.put('videos', rec); }
  catch (err) {
    console.error(err);
    toast('Mémoire interne pleine : la vidéo est seulement copiée dans Téléchargements.', 6000);
    S.storageFull = true;
  }
  if (S.settings.autoDownload || S.storageFull) downloadBlob(p.blob, fileName);
  writeToFolder(rec).catch(err => console.warn('Dossier :', err));
}
function showThanks() {
  $('#thanks-title').textContent = fillText(S.event.thanksTitle);
  $('#thanks-text').textContent = fillText(S.event.thanksText);
  show('thanks');
  const bar = $('#thanks-bar'), ms = Math.max(2, +S.event.thanksDelay || 6) * 1000;
  bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, fill: 'forwards' });
  clearTimeout(S.thanksTimer);
  S.thanksTimer = setTimeout(goHome, ms);
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
}
async function writeToFolder(rec) {
  if (!window.showDirectoryPicker) return;
  const dir = await DB.get('kv', 'dirHandle'); if (!dir) return;
  let perm = await dir.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') perm = await dir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
  if (perm !== 'granted') return;
  const sub = await dir.getDirectoryHandle(slug(S.events.find(e => e.id === rec.eventId)?.name), { create: true });
  const fh = await sub.getFileHandle(rec.fileName, { create: true });
  const w = await fh.createWritable(); await w.write(rec.blob); await w.close();
}

/* ================= Inactivité ================= */
function idleCheck() {
  if (S.adminOpen || S.rec.active) return;
  const idle = (Date.now() - S.lastActivity) / 1000, lim = Math.max(15, +S.settings.idleTimeout || 45);
  if (idle < lim) return;
  if (S.screen === 'review') { savePending(); return; }          // l'invité est parti : on garde son message
  if (['name', 'prompt'].includes(S.screen) || (S.screen === 'booth' && S.boothState === 'ready')) goHome();
}

/* ================= Verrouillage ================= */
function bindLock() {
  ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => { touch(); armBackTrap(); }, true));
  document.addEventListener('contextmenu', e => { if (!S.adminOpen) e.preventDefault(); });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dragstart', e => e.preventDefault());
  window.addEventListener('popstate', () => {
    if (S.settings.blockBack && !S.adminOpen) history.pushState({ mz: 1 }, '');
    else if (S.adminOpen) { closeAdmin(); history.pushState({ mz: 1 }, ''); }
  });
  document.addEventListener('pointerdown', () => { if (!S.adminOpen && S.screen === 'home') requestFullscreen(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquireWakeLock(); });
  // accès admin : appui long 2 s ou 5 tapes dans le coin haut gauche
  const hs = $('#hotspot'); let lp, taps = [];
  hs.addEventListener('pointerdown', e => {
    e.stopPropagation();
    lp = setTimeout(openPin, 2000);
    const now = Date.now(); taps = taps.filter(t => now - t < 2500); taps.push(now);
    if (taps.length >= 5) { taps = []; clearTimeout(lp); openPin(); }
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => hs.addEventListener(t, () => clearTimeout(lp)));
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') openPin(); });
  // clavier PIN
  $('#keypad').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.k || b.textContent;
    if (k === 'del') S.pinBuf = S.pinBuf.slice(0, -1);
    else if (k === 'ok') return checkPin();
    else if (S.pinBuf.length < 6) S.pinBuf += k;
    renderPin();
    if (S.pinBuf.length === S.settings.pin.length) checkPin();
  });
  $('#pin-cancel').addEventListener('click', () => ($('#pin').hidden = true));
}
function armBackTrap() { if (S.settings.blockBack && !(history.state && history.state.mz)) history.pushState({ mz: 1 }, ''); }
function requestFullscreen() {
  if (!S.settings.autoFullscreen || document.fullscreenElement || matchMedia('(display-mode: fullscreen)').matches) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
}
async function acquireWakeLock() {
  if (!S.settings.wakeLock || !('wakeLock' in navigator) || S.wakeLock) return;
  try { S.wakeLock = await navigator.wakeLock.request('screen'); S.wakeLock.addEventListener('release', () => (S.wakeLock = null)); } catch { }
}
function openPin() {
  if (S.rec.active || S.adminOpen) return;
  S.pinBuf = ''; $('#pin-msg').textContent = ''; renderPin(); $('#pin').hidden = false;
}
function renderPin() { $('#pin-dots').innerHTML = '<span></span>'.repeat(S.pinBuf.length); }
function checkPin() {
  if (S.pinLockUntil && Date.now() < S.pinLockUntil) { $('#pin-msg').textContent = 'Trop d’essais, patiente 30 s.'; S.pinBuf = ''; renderPin(); return; }
  if (S.pinBuf === S.settings.pin) { S.pinFails = 0; $('#pin').hidden = true; openAdmin(); return; }
  S.pinFails = (S.pinFails || 0) + 1;
  if (S.pinFails >= 5) { S.pinLockUntil = Date.now() + 30000; S.pinFails = 0; }
  $('#pin-msg').textContent = 'Code incorrect';
  const box = $('.pin-box'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
  S.pinBuf = ''; renderPin();
}

/* ================= Administration ================= */
function bindAdmin() {
  $('#adm-close').addEventListener('click', closeAdmin);
  $('#adm-nav').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#adm-nav button').forEach(x => x.classList.toggle('on', x === b));
    $$('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
    onTab(b.dataset.tab);
  });
  // liaisons génériques des champs
  $$('#admin [data-ev], #admin [data-set]').forEach(el => {
    const isEv = 'ev' in el.dataset, path = isEv ? el.dataset.ev : el.dataset.set;
    const handler = () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number' || el.type === 'range' || 'num' in el.dataset) v = parseFloat(el.value) || 0;
      else v = el.value;
      if (path === 'prompts') v = el.value.split('\n').map(s => s.trim()).filter(Boolean);
      if (isEv) { setPath(S.event, path, v); saveEvents(); applyEventSoon(); if (path === 'name') renderEvents(); }
      else { setPath(S.settings, path, v); saveSettings(); onSettingChange(path); }
    };
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', handler);
  });
  // images
  $$('.asset').forEach(box => {
    const field = box.dataset.asset;
    box.querySelector('input[type=file]').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const key = 'img_' + uid();
      await DB.put('assets', f, key);
      const old = S.event[field]; S.event[field] = key; saveEvents();
      await cleanupAsset(old); await applyEvent(); renderAssets();
    });
    box.querySelector('[data-remove]').addEventListener('click', async () => {
      const old = S.event[field]; S.event[field] = null; saveEvents();
      await cleanupAsset(old); await applyEvent(); renderAssets();
    });
  });
  $('#ev-new').addEventListener('click', async () => {
    const e = defaultEvent(); e.name = 'Nouvel événement'; e.title = 'Prénom & Prénom'; e.subtitle = 'Date de l’événement';
    S.events.push(e); await activateEvent(e.id); toast('Événement créé et activé.');
  });
  $('#ev-dup').addEventListener('click', async () => {
    const e = JSON.parse(JSON.stringify(S.event)); e.id = uid(); e.createdAt = Date.now(); e.name += ' (copie)';
    S.events.push(e); await activateEvent(e.id); toast('Copie créée et activée.');
  });
  $('#ev-list').addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const id = b.dataset.id, ev = S.events.find(x => x.id === id);
    if (b.dataset.act === 'activate') { await activateEvent(id); toast(`« ${ev.name} » est maintenant actif.`); }
    if (b.dataset.act === 'del') {
      if (S.events.length < 2) return toast('Il faut garder au moins un événement.');
      const n = await DB.countByIndex('videos', 'eventId', id);
      if (!confirm(`Supprimer « ${ev.name} »${n ? ` et ses ${n} vidéo(s)` : ''} ? C’est définitif.`)) return;
      await DB.delByIndex('videos', 'eventId', id);
      S.events = S.events.filter(x => x.id !== id);
      for (const k of [ev.bgAsset, ev.logoAsset, ev.frameAsset]) await cleanupAsset(k);
      if (S.event.id === id) await activateEvent(S.events[0].id); else { saveEvents(); renderEvents(); }
    }
  });
  $('#av-refresh').addEventListener('click', () => refreshDevices());
  $('#vid-zip').addEventListener('click', exportZip);
  $('#vid-dl-all').addEventListener('click', downloadAll);
  $('#vid-del-all').addEventListener('click', async () => {
    const n = await DB.countByIndex('videos', 'eventId', S.event.id);
    if (!n || !confirm(`Supprimer définitivement les ${n} vidéo(s) de « ${S.event.name} » de la tablette ?\nPense à les avoir exportées avant.`)) return;
    await DB.delByIndex('videos', 'eventId', S.event.id); renderVideos();
  });
  $('#vid-list').addEventListener('click', onVideoAction);
  $('#vmodal-close').addEventListener('click', () => { const v = $('#vmodal-video'); v.pause(); URL.revokeObjectURL(v.src); v.removeAttribute('src'); $('#vmodal').hidden = true; });
  if (window.showDirectoryPicker) {
    $('#folder-box').hidden = false;
    $('#folder-pick').addEventListener('click', async () => {
      try { const h = await showDirectoryPicker({ mode: 'readwrite' }); await DB.put('kv', h, 'dirHandle'); renderFolder(); } catch { }
    });
  }
  $('#pin-save').addEventListener('click', () => {
    const a = $('#pin-new').value, b = $('#pin-new2').value, msg = $('#pin-save-msg');
    if (!/^\d{4,6}$/.test(a)) return (msg.textContent = 'Le code doit faire 4 à 6 chiffres.');
    if (a !== b) return (msg.textContent = 'Les deux codes ne correspondent pas.');
    S.settings.pin = a; saveSettings(); $('#pin-new').value = $('#pin-new2').value = ''; msg.textContent = 'Code enregistré ✓';
  });
  $('#diag-run').addEventListener('click', renderDiag);
  $('#test-rec').addEventListener('click', testRecording);
}
function getPath(o, p) { return p.split('.').reduce((a, k) => a?.[k], o); }
function setPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }
function fillFontSelects() {
  $('#sel-font-title').innerHTML = FONTS_TITLE.map(f => `<option style="font-family:'${f}'">${f}</option>`).join('');
  $('#sel-font-body').innerHTML = FONTS_BODY.map(f => `<option style="font-family:'${f}'">${f}</option>`).join('');
}
function fillForm() {
  $$('#admin [data-ev], #admin [data-set]').forEach(el => {
    const isEv = 'ev' in el.dataset, path = isEv ? el.dataset.ev : el.dataset.set;
    const v = getPath(isEv ? S.event : S.settings, path);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (path === 'prompts') el.value = (v || []).join('\n');
    else if (el.type !== 'file') el.value = v ?? '';
  });
  $('#sel-cam').value = S.settings.cameraId || ''; $('#sel-mic').value = S.settings.micId || '';
}
function onSettingChange(path) {
  if (['cameraId', 'micId', 'resolution', 'noiseSuppression', 'autoGainControl', 'echoCancellation'].includes(path)) startMedia().then(updateAvInfo).catch(err => mediaFailed(err));
  if (['orientation', 'resolution', 'rotation'].includes(path)) { resizePreview(); updateAvInfo(); }
  if (path === 'wakeLock' && !S.settings.wakeLock && S.wakeLock) S.wakeLock.release().catch(() => {});
}
async function cleanupAsset(key) {
  if (!key) return;
  const used = S.events.some(e => [e.bgAsset, e.logoAsset, e.frameAsset].includes(key));
  if (!used) await DB.del('assets', key).catch(() => {});
}
async function activateEvent(id) {
  S.event = S.events.find(e => e.id === id); S.settings.activeEventId = id;
  saveEvents(); saveSettings(); await applyEvent(); fillForm(); renderEvents(); renderAssets();
}
function openAdmin() {
  S.adminOpen = true; $('#admin').hidden = false;
  if (document.fullscreenElement) { /* on reste en plein écran */ }
  navigator.storage?.persist?.().catch(() => {});
  fillForm(); renderEvents(); renderAssets(); renderFolder();
  const active = $('#adm-nav button.on')?.dataset.tab || 'events'; onTab(active);
  $('#adm-video').srcObject = S.media.stream;
}
function closeAdmin() {
  S.adminOpen = false; $('#admin').hidden = true; $('#adm-video').srcObject = null;
  revokeThumbs(); goHome();
}
function onTab(tab) {
  if (tab === 'videos') renderVideos();
  if (tab === 'av') { resumeAudio(); refreshDevices(); updateAvInfo(); }
  if (tab === 'diag') renderDiag();
  if (tab === 'events') renderEvents();
}
async function renderEvents() {
  const counts = {};
  for (const e of S.events) counts[e.id] = await DB.countByIndex('videos', 'eventId', e.id).catch(() => 0);
  $('#ev-list').innerHTML = S.events.slice().sort((a, b) => b.createdAt - a.createdAt).map(e => `
    <div class="ev-card ${e.id === S.event.id ? 'active' : ''}">
      <div class="meta"><b>${esc(e.name)}</b><small>${counts[e.id]} vidéo(s) · ${esc(e.title)}${e.subtitle ? ' · ' + esc(e.subtitle) : ''}</small></div>
      ${e.id === S.event.id ? '<span class="badge">Actif</span>' : `<button class="abtn sm" data-act="activate" data-id="${e.id}">Activer</button>`}
      <button class="abtn sm danger" data-act="del" data-id="${e.id}">Supprimer</button>
    </div>`).join('');
  $('#adm-active-name').textContent = S.event.name;
}
function renderAssets() {
  $$('.asset').forEach(box => {
    const key = S.event[box.dataset.asset], prev = box.querySelector('.asset-prev');
    const slot = { bgAsset: 'bg', logoAsset: 'logo', frameAsset: 'frame' }[box.dataset.asset];
    prev.innerHTML = key && S.assets[slot] ? `<img src="${S.assets[slot].url}" alt="">` : '';
    box.querySelector('[data-remove]').hidden = !key;
  });
}
async function renderFolder() {
  if (!window.showDirectoryPicker) return;
  const h = await DB.get('kv', 'dirHandle').catch(() => null);
  $('#folder-name').textContent = h ? `Dossier : ${h.name}/${slug(S.event.name)}` : 'Aucun dossier choisi';
}
function updateAvInfo() {
  const info = $('#av-info'), warn = $('#av-warn');
  if (!info) return;
  const st = S.media.stream, vt = st?.getVideoTracks()[0], at = st?.getAudioTracks()[0];
  const vs = vt?.getSettings?.() || {};
  const { w, h } = outputSize();
  info.innerHTML = st
    ? `Caméra : <b>${esc(vt?.label || '—')}</b> (${vs.width || '?'}×${vs.height || '?'} à ${Math.round(vs.frameRate || 0) || '?'} i/s)<br>
       Micro : <b>${esc(at?.label || 'aucun')}</b><br>
       Vidéo enregistrée : ${w}×${h} · format ${esc((pickMime() || 'inconnu').split(';')[0])}`
    : 'Caméra non démarrée.';
  const msg = S.media.error || S.media.warning;
  warn.hidden = !msg; warn.textContent = msg || '';
}

/* ---------- Vidéos ---------- */
let thumbUrls = [];
function revokeThumbs() { thumbUrls.forEach(u => URL.revokeObjectURL(u)); thumbUrls = []; }
async function eventVideos() { return (await DB.byIndex('videos', 'eventId', S.event.id)).sort((a, b) => b.createdAt - a.createdAt); }
async function renderVideos() {
  revokeThumbs();
  const vids = await eventVideos();
  const total = vids.reduce((a, v) => a + v.size, 0), dur = vids.reduce((a, v) => a + (v.duration || 0), 0);
  let quota = '';
  try { const est = await navigator.storage.estimate(); quota = `${fmtSize(est.quota - est.usage)}`; } catch { }
  $('#vid-stats').innerHTML = `
    <div class="stat"><b>${vids.length}</b><span>message(s)</span></div>
    <div class="stat"><b>${fmtDur(dur)}</b><span>durée totale</span></div>
    <div class="stat"><b>${fmtSize(total)}</b><span>taille</span></div>
    ${quota ? `<div class="stat"><b>${quota}</b><span>encore disponibles</span></div>` : ''}`;
  $('#vid-list').innerHTML = vids.length ? vids.map(v => {
    const t = v.thumb ? URL.createObjectURL(v.thumb) : ''; if (t) thumbUrls.push(t);
    return `<div class="vid">
      ${t ? `<img src="${t}" alt="">` : '<img alt="">'}
      <div class="meta"><b>${esc(v.fileName)}</b><small>${fmtDate(v.createdAt)} · ${fmtDur(v.duration || 0)} · ${fmtSize(v.size)}${v.guestName ? ' · ' + esc(v.guestName) : ''}</small>
      ${v.prompt ? `<small>« ${esc(v.prompt)} »</small>` : ''}</div>
      <div class="acts">
        <button class="abtn sm" data-v="play" data-id="${v.id}">Lire</button>
        <button class="abtn sm" data-v="dl" data-id="${v.id}">Télécharger</button>
        ${navigator.canShare ? `<button class="abtn sm" data-v="share" data-id="${v.id}">Partager</button>` : ''}
        <button class="abtn sm danger" data-v="del" data-id="${v.id}">Supprimer</button>
      </div></div>`;
  }).join('') : '<p class="help">Aucune vidéo pour cet événement pour l’instant.</p>';
}
async function onVideoAction(e) {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  const v = await DB.get('videos', b.dataset.id); if (!v) return;
  if (b.dataset.v === 'play') { const m = $('#vmodal-video'); m.src = URL.createObjectURL(v.blob); $('#vmodal').hidden = false; m.play().catch(() => {}); }
  if (b.dataset.v === 'dl') downloadBlob(v.blob, v.fileName);
  if (b.dataset.v === 'share') {
    const file = new File([v.blob], v.fileName, { type: v.blob.type });
    if (navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: v.fileName }).catch(() => {});
    else toast('Partage de fichiers non disponible sur cet appareil.');
  }
  if (b.dataset.v === 'del' && confirm(`Supprimer ${v.fileName} ?`)) { await DB.del('videos', v.id); renderVideos(); }
}
async function exportZip() {
  const vids = await eventVideos(), out = $('#zip-progress');
  if (!vids.length) return toast('Aucune vidéo à exporter.');
  const total = vids.reduce((a, v) => a + v.size, 0);
  if (total > 3.9e9) return toast('Plus de 4 Go : utilise « Télécharger une par une ».', 6000);
  $('#vid-zip').disabled = true;
  try {
    const entries = [];
    for (let i = 0; i < vids.length; i++) {
      const v = vids[i];
      const crc = await Zip.crc32Blob(v.blob, p => (out.textContent = `Préparation ${i + 1}/${vids.length} (${Math.round(p * 100)} %)…`));
      entries.push({ name: v.fileName, blob: v.blob, crc, date: new Date(v.createdAt) });
    }
    const csv = '﻿' + ['Fichier;Date;Durée (s);Prénom;Question']
      .concat(vids.slice().reverse().map(v => [v.fileName, fmtDate(v.createdAt), Math.round(v.duration || 0), v.guestName, v.prompt]
        .map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';'))).join('\r\n');
    const csvBytes = new TextEncoder().encode(csv);
    entries.unshift({ name: 'liste-des-messages.csv', blob: new Blob([csvBytes]), crc: Zip.crc32Bytes(csvBytes), date: new Date() });
    downloadBlob(Zip.build(entries), `${slug(S.event.name)}_livre-dor-video.zip`);
    out.textContent = `ZIP prêt : ${vids.length} vidéo(s), ${fmtSize(total)}. Il arrive dans Téléchargements.`;
  } catch (err) { console.error(err); out.textContent = 'Erreur pendant l’export : ' + err.message; }
  $('#vid-zip').disabled = false;
}
async function downloadAll() {
  const vids = await eventVideos(); if (!vids.length) return toast('Aucune vidéo.');
  toast('Si le navigateur demande l’autorisation de télécharger plusieurs fichiers, accepte.', 5000);
  for (const v of vids) { downloadBlob(v.blob, v.fileName); await sleep(900); }
}

/* ---------- Diagnostic ---------- */
async function renderDiag() {
  const rows = [];
  const ok = (b, y = 'Oui', n = 'Non') => `<span class="${b ? 'ok' : 'ko'}">${b ? y : n}</span>`;
  rows.push(['Version de l’app', APP_VERSION]);
  rows.push(['Connexion sécurisée (https)', ok(window.isSecureContext)]);
  rows.push(['Installée en application', ok(matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches, 'Oui', 'Non (ouvre-la depuis l’icône)')]);
  rows.push(['Accès caméra/micro', ok(!!S.media.stream, 'Actif', S.media.error || 'Inactif')]);
  const cams = S.media.devices.filter(d => d.kind === 'videoinput'), mics = S.media.devices.filter(d => d.kind === 'audioinput');
  rows.push(['Caméras détectées', cams.map(d => esc(d.label || 'sans nom')).join('<br>') || '<span class="ko">Aucune</span>']);
  rows.push(['Micros détectés', mics.map(d => esc(d.label || 'sans nom')).join('<br>') || '<span class="ko">Aucun</span>']);
  const mime = pickMime();
  rows.push(['Format d’enregistrement', mime ? `${esc(mime)} ${/avc[13]/.test(mime) ? ok(true, '(MP4 H.264, lisible partout)') : '<span class="ko">(pas de H.264 : lisible sur ordinateur/VLC, à convertir pour iPhone)</span>'}` : ok(false, '', 'Enregistrement impossible')]);
  try {
    const est = await navigator.storage.estimate(), pers = await navigator.storage.persisted?.();
    rows.push(['Stockage', `${fmtSize(est.usage)} utilisés · ${fmtSize(est.quota - est.usage)} disponibles`]);
    rows.push(['Stockage protégé contre l’effacement', ok(!!pers, 'Oui', 'Non (installer l’app aide)')]);
  } catch { }
  rows.push(['Anti-veille de l’écran', ok('wakeLock' in navigator, 'Disponible', 'Non disponible')]);
  rows.push(['Écriture dans un dossier choisi', 'showDirectoryPicker' in window ? 'Disponible (ordinateur)' : 'Non (Android) → copie dans Téléchargements']);
  rows.push(['Navigateur', esc(navigator.userAgent)]);
  $('#diag').innerHTML = rows.map(([k, v]) => `<div class="k">${k}</div><div>${v}</div>`).join('');
}
async function testRecording() {
  const msg = $('#test-rec-msg');
  if (!S.media.stream) return (msg.textContent = 'Caméra non démarrée.');
  const r = makeRecorder();
  S.testRec = true; r.mr.start(500); msg.textContent = 'Enregistrement test en cours (5 s)… parle dans le micro.';
  await sleep(5000);
  const done = new Promise(res => (r.mr.onstop = res)); r.mr.stop(); await done;
  S.testRec = false; r.vTrack.stop();
  const blob = new Blob(r.chunks, { type: r.mime.split(';')[0] });
  msg.textContent = `Test terminé : ${fmtSize(blob.size)}, ${r.w}×${r.h}, ${r.mime.split(';')[0]}. Lecture ci-dessous.`;
  const m = $('#vmodal-video'); m.src = URL.createObjectURL(blob); $('#vmodal').hidden = false; m.play().catch(() => {});
}

init().catch(err => { console.error(err); toast('Erreur au démarrage : ' + err.message, 8000); });
