/* Bloomfield Drift — car radio (BD.radio). Loaded after game.js: <script src="radio.js"></script>.
   Adds: GTA-style radio stations that each run on their own clock (switch away and back and the song has moved on; the clock
   only runs while the radio is audible, so a menu, the pause panel or a hidden tab stops it and it resumes mid-song), a HUD
   banner on switch and song change (station, then "title — performer · year"; hidden with the HUD in photo mode), short spoken
   station idents and bulletins between songs (the browser's speechSynthesis with an English voice; skipped silently when there
   is none), the spoken-only "Bloomfield Talk" station, and "My Music" (the GTA self radio): audio files the player picks with a
   file input ("Add music" in Options and on the radio banner) play locally in shuffle, persist in IndexedDB ('bd-radio') and are
   never uploaded; the station appears once it has a song. Keys ] [ \ (next, previous, off), the gamepad d-pad left/right (only
   while driving with no panel open), a RADIO touch button next to CAM, the persisted station and per-station clock (store key
   'radio'), and the radio keys plus music credits in the Controls panel. Playlists come from radio/credits.json: [{station
   (folder key), file, title, performer, year, licence, source (Commons file page), dur (s), note}]; a station with no songs is
   dropped, and without the folder only My Music (once filled) and the talk station remain.
   Public: BD.radio = { next(), prev(), off(), setVolume(v 0..1), station (index or -1), stations (names), current (song or null) }.
   setVolume is the music level handed over by BD.audio (master * music, VOLUME CONTRACT); the Sound option (BD.game.settings.sound)
   mutes. One HTMLAudioElement, no per-frame allocations; CSS is injected from here so index.html only needs the script tag. */
(function () {
  'use strict';
  const B = (window.BD = window.BD || {});
  const G = B.game;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const $ = (id) => document.getElementById(id);
  const BASE = 'radio/';
  const KEY_STATE = 'radio';

  // ---- stations: folder key, on-air name, spoken idents. Music stations need songs in credits.json; talk is speech only; mine is the player's files.
  const STATIONS = [
    { key: 'rock', name: 'Hoosier Rock', songs: [], idents: [
      'Hoosier Rock. Loud guitars for long straight roads.',
      "You're listening to Hoosier Rock, turned all the way up from the square to the White River.",
      'This is Hoosier Rock. Windows down, volume up.'] },
    { key: 'night', name: 'Night Drive', songs: [], idents: [
      'Night Drive. Synths and street lights, even in a town this size.',
      "You're tuned to Night Drive. Keep it smooth through the bends.",
      'This is Night Drive, electronic music for the empty roads after dark.'] },
    { key: 'country', name: 'Greene County Country', songs: [], idents: [
      "You're listening to Greene County Country, music for the back roads of Bloomfield.",
      'Greene County Country. Fiddles, banjos, and a long gravel road.',
      'This is Greene County Country, keeping you company from the square to the county line.'] },
    { key: 'jazz', name: 'Riverside Jazz & Blues', songs: [], idents: [
      'Riverside Jazz and Blues. Swing, lounge and the blues, all day long.',
      "You're tuned to Riverside Jazz and Blues. Roll the windows down.",
      'Riverside Jazz and Blues, from the banks of the White River to your dashboard.'] },
    { key: 'talk', name: 'Bloomfield Talk', talk: true, idents: [
      'This is Bloomfield Talk, the voice of the courthouse square.',
      "You're listening to Bloomfield Talk. News, weather and the roads, all day long."] },
    { key: 'mine', name: 'My Music', mine: true, songs: [], order: [], i: 0, pos: 0, idents: [] },
  ];
  const MINE = STATIONS[STATIONS.length - 1], mine = MINE.songs;     // My Music: { id, name, size, title, blob }
  // bulletins: { h: banner heading, t: spoken text }. Short sentences: each is spoken as its own utterance.
  const BULLETINS = [
    { h: 'Apple Festival news', t: 'Apple Festival news. The square is full this weekend, with craft stalls on the courthouse lawn and the parade down Main Street on Saturday morning. Parking is tight, so come early and walk the last block.' },
    { h: 'Weather', t: 'Greene County weather. A clear fall day, sunny and dry, with a high in the low sixties and a light breeze out of the west. Cooler tonight, down near forty, and a crisp sunrise tomorrow.' },
    { h: 'Road notes', t: 'Road notes. Expect slow traffic around the square for the festival, and wet leaves on Spring Street and Seminary Street. Washington Street is clear. Watch for farm equipment on U S 231 south of town.' },
    { h: 'Apple Festival news', t: 'More from the Apple Festival. The pie contest is judged at two on the courthouse steps, and the band plays on the square at six. Bring a chair, and bring a sweater.' },
    { h: 'Road notes', t: 'Out on Cold Springs Road and Furnace Road the gravel is loose after the dry spell. Take the bends easy, and mind the soft shoulders.' },
    { h: 'Drive safe', t: 'A word from the station. These are our streets and our neighbours. Keep it slow near the school and the square, and save the sideways stuff for the back roads. We will see you out there.' },
  ];

  // ---- state
  let stations = [], st = -1, started = false, loaded = false;     // st: index into stations, -1 = off
  let vol = 0.8 * 0.6;                    // contract default until BD.audio hands over master * music
  let lastVol = -1, active = false, acc = 0, tAct = 0, saveT = 0, blocked = 0;
  let cur = null, curIdx = -1, boundaries = 0, errors = 0, talkIdx = 0, talkTimer = 0, bulletin = 0, seekTo = 0, url = '';
  const rt = () => acc + (active ? (performance.now() - tAct) / 1000 : 0);     // radio clock: seconds the radio has been audible
  const evol = () => (G && G.settings && G.settings.sound === false ? 0 : vol);
  const saved = (G && G.store.get(KEY_STATE, null)) || {};
  let wantKey = typeof saved.key === 'string' ? saved.key : 'rock';      // 'off' or a station key (the first station when it is gone)
  if (typeof saved.talk === 'number') talkIdx = saved.talk;
  if (typeof saved.bnd === 'number') boundaries = saved.bnd;

  const setVolume = (v) => { vol = clamp(+v || 0, 0, 1); };
  if (!G || typeof Audio === 'undefined') { B.radio = { next() {}, prev() {}, off() {}, setVolume, station: -1, stations: [], current: null }; return; }

  // ---- DOM: style, HUD banner (with an "Add music" chip), touch button
  const css = document.createElement('style');
  css.textContent = [
    '#rdBanner{position:absolute;left:0;bottom:162px;max-width:min(320px,46%);pointer-events:none;opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s;background:rgba(24,22,23,.8);box-shadow:inset 0 0 0 1.5px var(--line),0 2px 8px rgba(0,0,0,.4);border-radius:0 6px 6px 0;padding:5px 12px 6px 10px;border-left:3px solid var(--gold)}',
    '#rdBanner.on{opacity:1;visibility:visible}',
    '#rdBanner .rdName{font:700 12px/1.25 var(--text);letter-spacing:.14em;text-transform:uppercase;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#rdBanner .rdSong{font:16px/1.2 var(--text);color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#rdBanner .rdAdd{display:block;pointer-events:auto;margin-top:5px;border:0;border-radius:3px;background:transparent;box-shadow:inset 0 0 0 1.5px var(--line);color:var(--cream);font:700 12px/1 var(--text);letter-spacing:.08em;text-transform:uppercase;padding:5px 8px;min-height:24px}',
    '#rdBanner:not(.on) .rdAdd{pointer-events:none}',
    '.touch #rdBanner{bottom:auto;top:62px;left:112px;max-width:min(300px,calc(100% - 300px))}',
    '.touch #rdBanner .rdAdd{min-height:32px;padding:8px 10px}',
    '#tRadio{left:70px;bottom:96px;width:64px;height:44px;border-radius:12px}',
    '.rdCredits{display:grid;gap:6px;margin-top:4px}.rdCredits a{color:var(--gold)}.rdCredits .rdSt{color:var(--cream);font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-top:6px}',
    '.rdMine{display:grid;gap:4px;max-height:168px;overflow:auto}',
    '.rdMine div{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:3px 4px 3px 8px;border-radius:4px;background:rgba(246,234,211,.07)}',
    '.rdMine span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cream);font-size:15px}',
    '.rdMine button{flex:none}',
    '@media (max-width:520px){#rdBanner{bottom:122px}}',
    '@media (prefers-reduced-motion:reduce){#rdBanner{transition:none}}',
  ].join('\n');
  document.head.append(css);
  const ban = document.createElement('div'), bName = document.createElement('div'), bSong = document.createElement('div'), bAdd = document.createElement('button');
  ban.id = 'rdBanner'; ban.setAttribute('role', 'status'); bName.className = 'rdName'; bSong.className = 'rdSong'; bAdd.className = 'rdAdd'; bAdd.textContent = '+ Add music';
  bAdd.setAttribute('aria-label', 'Add your own music files to the My Music station');
  ban.append(bName, bSong, bAdd);
  ($('stage2') || $('hud') || document.body).append(ban);
  let banT = 0;
  function banner(name, song) {
    bName.textContent = name; bSong.textContent = song || ''; bSong.hidden = !song;
    ban.classList.add('on'); clearTimeout(banT); banT = setTimeout(() => ban.classList.remove('on'), 4500);
  }
  const tb = document.createElement('button');
  tb.className = 'pad'; tb.id = 'tRadio'; tb.textContent = 'RADIO'; tb.setAttribute('aria-label', 'Radio: next station'); tb.hidden = true;
  tb.onclick = () => next();
  if ($('touch')) $('touch').append(tb);

  // ---- the player
  const el = new Audio(); el.preload = 'metadata'; el.id = 'rdAudio'; document.body.append(el);     // in the DOM so tools can find it; renders nothing
  const kick = () => { if (!active || st < 0 || !cur) return; const p = el.play(); if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') blocked = 1; }); };
  // autoplay refused (no gesture yet): try again on the next gesture
  const gesture = () => { if (blocked === 1) { blocked = 0; kick(); } };
  addEventListener('pointerdown', gesture, true); addEventListener('keydown', gesture, true);
  const loc = { i: 0, p: 0 };
  function locate(s) {       // where the station's clock stands: song index loc.i and seconds into it loc.p
    let p = (rt() + s.off) % s.total; if (p < 0) p += s.total;
    let i = 0; while (i < s.songs.length - 1 && p >= s.start[i + 1]) i++;
    loc.i = i; loc.p = p - s.start[i];
  }
  const align = (s, k) => { s.off = (s.start[k] - rt()) % s.total; };     // the clock now points at the start of song k
  function play(s, k, p) {
    curIdx = k;
    if (s.mine) { const old = url; cur = s.order[k]; url = URL.createObjectURL(cur.blob); el.src = url; if (old) URL.revokeObjectURL(old); }
    else { cur = s.songs[k]; el.src = BASE + cur.file; }
    seekTo = p > 0.5 && (s.mine || p < cur.dur - 1) ? p : 0;     // applied once the metadata is in (a seek before that is dropped)
    kick();
    banner(s.name, cur.title + (cur.performer ? ' — ' + cur.performer : '') + (cur.year ? ' · ' + cur.year : ''));
  }
  el.addEventListener('loadedmetadata', () => { if (seekTo > 0 && seekTo < el.duration - 1) el.currentTime = seekTo; seekTo = 0; });
  el.addEventListener('playing', () => { errors = 0; });
  function step(s) {     // the next song of station s after the current one ended or failed
    const k = curIdx + 1;
    if (s.mine) { if (k >= s.order.length) shuffle(); play(s, k % s.order.length, 0); return; }
    align(s, k % s.songs.length); play(s, k % s.songs.length, 0);
  }
  el.addEventListener('ended', () => {
    const s = stations[st]; if (!s || s.talk || !cur) return;
    if (s.mine) { step(s); return; }
    boundaries++;
    if (boundaries % 2 === 0 && canSpeak()) {     // an ident, and every other time a bulletin, at most every other song
      const k = (curIdx + 1) % s.songs.length;
      let text = s.idents[(boundaries >> 1) % s.idents.length];
      if (boundaries % 4 === 0) { const b = BULLETINS[bulletin++ % BULLETINS.length]; text += ' ' + b.t; banner(s.name, b.h); } else banner(s.name, '');
      speak(text, () => { align(s, k); play(s, k, 0); });
    } else step(s);
  });
  el.addEventListener('error', () => {
    const s = stations[st]; if (!s || s.talk || !cur || !el.error) return;     // el.error is null again once a newer source loads: a stale event
    const len = s.mine ? s.order.length : s.songs.length;
    if (++errors >= len) { banner(s.name, s.mine ? 'These files do not play in this browser' : 'No signal'); cur = null; return; }
    step(s);     // a missing or unplayable file: skip to the next song
  });

  // ---- speech (idents, bulletins, the talk station)
  const SS = window.speechSynthesis || null;
  let voice = null, utt = null, spkDone = null, spkTimer = 0, spkToken = 0;
  function pickVoice() {
    voice = null; if (!SS) return;
    const vs = SS.getVoices();
    for (let i = 0; i < vs.length && !voice; i++) if (/^en[-_]US/i.test(vs[i].lang)) voice = vs[i];
    for (let i = 0; i < vs.length && !voice; i++) if (/^en/i.test(vs[i].lang)) voice = vs[i];
  }
  const canSpeak = () => !!(SS && voice);
  if (SS) { pickVoice(); if (SS.addEventListener) SS.addEventListener('voiceschanged', () => { pickVoice(); const s = stations[st]; if (active && s && s.talk && !utt && !talkTimer) talkNext(); }); }
  function speak(text, done) {       // one utterance per sentence (long utterances can lose their end event); done() once after the last
    if (!canSpeak()) { done(); return; }
    const parts = text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [text];
    const tok = ++spkToken, v = evol(); let left = parts.length;
    const fin = () => { if (tok === spkToken && --left <= 0) hush(); };
    if (SS.speaking || SS.pending) SS.cancel();
    spkDone = done;
    for (let i = 0; i < parts.length; i++) {
      const u = new SpeechSynthesisUtterance(parts[i].trim()); u.voice = voice; u.lang = voice.lang; u.volume = v; u.rate = 1; u.pitch = 1;
      u.onend = fin; u.onerror = fin; utt = u; SS.speak(u);
    }
    clearTimeout(spkTimer); spkTimer = setTimeout(() => { if (tok === spkToken) hush(); }, 8000 + 600 * text.split(' ').length);     // safety net if the end event never comes
  }
  function hush() {     // end the speech now and run what follows it (a menu or a hidden tab cuts an ident short this way)
    if (!utt) return; const d = spkDone; spkToken++; clearTimeout(spkTimer); utt = null; spkDone = null; SS.cancel(); if (d) d();
  }
  function stopSpeech() { spkToken++; clearTimeout(spkTimer); clearTimeout(talkTimer); talkTimer = 0; utt = null; spkDone = null; if (SS) SS.cancel(); }
  function talkNext() {
    talkTimer = 0; const s = stations[st]; if (!active || !s || !s.talk) return;
    if (!canSpeak()) { banner(s.name, SS ? 'No speech voice in this browser' : 'Speech is not available here'); return; }
    const n = talkIdx++; let text, head;
    if (n % 3 === 0) { text = s.idents[(n / 3 | 0) % s.idents.length]; head = ''; } else { const b = BULLETINS[(n - (n / 3 | 0) - 1) % BULLETINS.length]; text = b.t; head = b.h; }
    banner(s.name, head);
    speak(text, () => { talkTimer = setTimeout(talkNext, 1500); });
  }

  // ---- tuning
  function tune(i) {
    const was = stations[st]; if (was && was.mine && cur) { was.pos = el.currentTime; was.i = curIdx; }     // My Music resumes where it left off
    stopSpeech(); el.pause(); cur = null; curIdx = -1; errors = 0;
    st = i; if (n()) { wantKey = i < 0 ? 'off' : stations[i].key; save(); }     // no stations (yet): keep the saved choice
    if (i < 0) { if (n()) banner('Radio off', ''); return; }
    const s = stations[i];
    if (s.talk) { banner(s.name, ''); talkNext(); return; }
    if (s.mine) { play(s, s.i < s.order.length ? s.i : 0, s.pos); return; }
    locate(s); play(s, loc.i, loc.p);
  }
  const n = () => stations.length;
  const none = () => { if (n()) return false; if (loaded) banner('Radio', 'No stations yet: add your own music'); return true; };
  function next() { if (!none()) tune(st + 1 >= n() ? -1 : st + 1); }     // ... last station → off → first
  function prev() { if (!none()) tune(st < 0 ? n() - 1 : st - 1); }
  function off() { if (st >= 0) tune(-1); }
  function setActive(a) {
    if (a === active) return;
    if (a) { tAct = performance.now(); active = true; kick(); const s = stations[st]; if (s && s.talk && !utt && !talkTimer) talkNext(); }
    else { acc = rt(); active = false; el.pause(); hush(); clearTimeout(talkTimer); talkTimer = 0; }
  }
  const check = () => setActive(st >= 0 && started && G.mode === 'drive' && !G.panel && !document.hidden);
  document.addEventListener('visibilitychange', check);
  function save() {
    if (!loaded) return;
    const off = saved.off || (saved.off = {});
    for (const s of stations) if (s.total) { let p = (rt() + s.off) % s.total; if (p < 0) p += s.total; off[s.key] = Math.round(p * 10) / 10; }
    G.store.set(KEY_STATE, { key: wantKey, off, talk: talkIdx, bnd: boundaries });
  }
  addEventListener('pagehide', save);

  // ---- input: keys and the d-pad (game.js leaves [ ] \ and d-pad left/right unused while driving)
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target && e.target.tagName === 'INPUT') || G.mode !== 'drive' || G.panel) return;
    if (e.code === 'BracketRight') next(); else if (e.code === 'BracketLeft') prev(); else if (e.code === 'Backslash') off();
  });
  let padL = false, padR = false;
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null; if (!pads) return;
    let gp = null; for (let i = 0; i < pads.length && !gp; i++) { const g = pads[i]; if (g && g.connected && g.buttons.length >= 16) gp = g; }
    const l = !!(gp && gp.buttons[14].pressed), r = !!(gp && gp.buttons[15].pressed);
    if (l && !padL) prev(); if (r && !padR) next();
    padL = l; padR = r;
  }
  G.on('frame', (dt, driving) => {
    check();
    const v = evol(); if (v !== lastVol) { lastVol = v; el.volume = v; el.muted = v === 0; }     // muted too: iOS ignores volume
    if (driving) pollPad();
    saveT += dt; if (saveT > 10) { saveT = 0; save(); }
  });
  G.on('drive', () => { if (!started) { started = true; if (loaded) tune(st); } });

  // ---- My Music: the player's own files, kept in IndexedDB (nothing leaves the browser)
  let db = null, seq = 0, mineMsg = '';
  function shuffle() { const a = MINE.order; a.length = 0; for (const r of mine) a.push(r); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0, t = a[i]; a[i] = a[j]; a[j] = t; } }
  function idb(mode, fn) {
    return new Promise((res, rej) => {
      if (!db) { rej(new Error('no database')); return; }
      const tx = db.transaction('songs', mode), q = fn(tx.objectStore('songs'));
      tx.oncomplete = () => res(q && q.result); tx.onerror = tx.onabort = () => rej(tx.error);
    });
  }
  function openDb() {
    return new Promise((res) => {
      let q; try { q = indexedDB.open('bd-radio', 1); } catch (e) { res(); return; }
      q.onupgradeneeded = () => q.result.createObjectStore('songs', { keyPath: 'id' });
      q.onsuccess = () => { db = q.result; res(); }; q.onerror = q.onblocked = () => res();
    }).then(() => (db ? idb('readonly', (o) => o.getAll()) : [])).then((rows) => {
      for (const r of rows || []) if (r && r.blob) mine.push(r);
      mine.sort((a, b) => (a.id < b.id ? -1 : 1));
    }).catch(() => { /* no IndexedDB here (private window): My Music lasts for the session */ });
  }
  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba|webm)$/i;
  async function addFiles(files) {
    let added = 0, skipped = 0, unsaved = 0;
    for (const f of files) {
      if (!/^audio\//.test(f.type) && !AUDIO_EXT.test(f.name)) { skipped++; continue; }
      if (mine.some((r) => r.name === f.name && r.size === f.size)) continue;
      const r = { id: Date.now().toString(36) + '-' + (seq++).toString(36), name: f.name, size: f.size, title: f.name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() || f.name, blob: f };
      mine.push(r); added++;
      // ponytail: whole files go into IndexedDB (the browser quota is the limit; a failed put plays for this session only), keep File System Access handles instead if collections get big
      if (db) try { await idb('readwrite', (o) => o.put(r)); } catch (e) { unsaved++; } else unsaved++;
    }
    mineMsg = (added ? added + (added === 1 ? ' song added' : ' songs added') : 'Nothing new added') + (skipped ? ', ' + skipped + ' not audio' : '') + (unsaved ? '. ' + unsaved + ' could not be stored in this browser and will play this session only' : '') + '.';
    mineChanged(added > 0);
  }
  async function removeSong(r) {
    const i = mine.indexOf(r); if (i < 0) return;
    mine.splice(i, 1); mineMsg = '';
    if (db) try { await idb('readwrite', (o) => o.delete(r.id)); } catch (e) { /* gone for this session anyway */ }
    mineChanged(false);
  }
  async function clearSongs() {
    mine.length = 0; mineMsg = 'My Music is empty.';
    if (db) try { await idb('readwrite', (o) => o.clear()); } catch (e) { /* gone for this session anyway */ }
    mineChanged(false);
  }
  function mineChanged(tuneIn) {
    const onAir = loaded && stations[st] === MINE, playing = onAir ? cur : null;
    shuffle();
    const k = playing ? MINE.order.indexOf(playing) : -1;
    if (k > 0) { MINE.order[k] = MINE.order[0]; MINE.order[0] = playing; }     // the song on air stays on air, now first in the new order
    if (k >= 0) curIdx = 0; else { MINE.i = 0; MINE.pos = 0; }
    if (loaded) rebuild();
    if (loaded && tuneIn && !onAir) tune(stations.indexOf(MINE));     // the player just picked their songs: play them
    else if (onAir && k < 0 && mine.length) play(MINE, 0, 0);     // the song on air was removed
    renderMine();
  }
  // the file input, the Options row and the banner chip
  const fileIn = document.createElement('input');
  fileIn.type = 'file'; fileIn.accept = 'audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac'; fileIn.multiple = true; fileIn.hidden = true; fileIn.id = 'rdFile';
  fileIn.onchange = () => { const f = Array.from(fileIn.files || []); fileIn.value = ''; if (f.length) addFiles(f); };
  document.body.append(fileIn);
  const pick = (e) => { if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur(); fileIn.click(); };     // blur: Space (handbrake) must not press it again
  bAdd.onclick = pick;
  const optRow = document.createElement('div'), optBtns = document.createElement('div'), bOptAdd = document.createElement('button'), bOptClear = document.createElement('button');
  const optLabel = document.createElement('label'), optList = document.createElement('div'), optNote = document.createElement('p');
  optRow.className = 'opt'; optBtns.className = 'row'; optLabel.textContent = 'My Music';
  bOptAdd.className = bOptClear.className = 'btn ghost small'; bOptAdd.id = 'rdAddOpt'; bOptAdd.textContent = 'Add music'; bOptClear.id = 'rdClear';
  let clearArm = 0;
  bOptAdd.onclick = pick;
  bOptClear.onclick = () => {     // two taps: the first one arms it for 3 s
    if (clearArm) { clearTimeout(clearArm); clearArm = 0; clearSongs(); return; }
    bOptClear.textContent = 'Tap again to clear'; clearArm = setTimeout(() => { clearArm = 0; bOptClear.textContent = 'Clear all'; }, 3000);
  };
  optBtns.append(bOptAdd, bOptClear); optRow.append(optLabel, optBtns);
  optList.className = 'rdMine'; optNote.className = 'fine';
  const pOpt = $('pOptions');
  if (pOpt) {
    const pad = $('bPadSetup'), before = pad && pad.closest('.opt');
    for (const x of [optRow, optList, optNote]) if (before) pOpt.insertBefore(x, before); else pOpt.append(x);
  }
  function renderMine() {
    optList.textContent = ''; bOptClear.textContent = 'Clear all';
    for (const r of mine) {
      const row = document.createElement('div'), t = document.createElement('span'), x = document.createElement('button');
      t.textContent = r.title; t.title = r.name; x.className = 'btn ghost small'; x.textContent = 'Remove'; x.setAttribute('aria-label', 'Remove ' + r.title);
      x.onclick = () => removeSong(r); row.append(t, x); optList.append(row);
    }
    optList.hidden = !mine.length; bOptClear.hidden = !mine.length;
    optNote.textContent = (mineMsg ? mineMsg + ' ' : '') + (mine.length
      ? mine.length + (mine.length === 1 ? ' song' : ' songs') + ' on the My Music station, played in shuffle. They stay in this browser; nothing is uploaded.'
      : 'Play songs you own on the radio: add audio files from this device. They stay in this browser; nothing is uploaded.');
  }

  // ---- playlists from radio/credits.json, and the station list
  let list = [];
  function load(c) {
    list = Array.isArray(c) ? c : [];
    const off = saved.off || {};
    for (const r of list) { const s = STATIONS.find((x) => x.key === r.station); if (s && !s.talk && !s.mine && r.file && r.dur > 0) s.songs.push({ station: s.name, file: s.key + '/' + String(r.file).replace(/^.*\//, ''), title: r.title || '', performer: r.performer || '', year: r.year || '', dur: +r.dur, licence: r.licence || '', source: r.source || '', note: r.note || '' }); }
    for (const s of STATIONS) {
      if (s.talk || s.mine || !s.songs.length) continue;
      s.start = new Float64Array(s.songs.length); let t = 0;
      for (let i = 0; i < s.songs.length; i++) { s.start[i] = t; t += s.songs[i].dur; }
      s.total = t; s.off = typeof off[s.key] === 'number' ? off[s.key] % t : Math.random() * t;     // first time: already on air somewhere
    }
  }
  function rebuild() {     // the stations that have something to play; keeps the station on air
    const playing = loaded ? stations[st] : null;
    stations = STATIONS.filter((s) => s.talk || s.songs.length);
    if (!stations.some((s) => !s.talk)) stations = [];     // no music at all: no radio
    if (!loaded) { st = wantKey === 'off' ? -1 : stations.findIndex((s) => s.key === wantKey); if (st < 0 && wantKey !== 'off' && n()) st = 0; }
    else if (playing) { st = stations.indexOf(playing); if (st < 0) tune(n() ? 0 : -1); }
    tb.hidden = !n();
  }
  function credits() {
    const h = $('pHelp'); if (!h) return;
    const kb = h.querySelector('.kb'), tp = h.querySelector('.tp');
    const keyRow = (box, keys, what) => { if (!box) return; const d = document.createElement('div'), s = document.createElement('span'); for (const k of keys) { const e = document.createElement('kbd'); e.textContent = k; d.append(e, ' '); } s.textContent = what; box.append(d, s); };
    keyRow(kb, [']', '[', '\\'], 'Radio: next station, previous, off (gamepad: d-pad right, left)');
    keyRow(tp, ['RADIO'], 'Next radio station (after the last one: off)');
    const songs = list.filter((r) => STATIONS.some((s) => s.key === r.station && s.songs.length && !s.mine));
    if (!songs.length) return;
    const p = document.createElement('p'), b = document.createElement('b'), d = document.createElement('div');
    p.className = 'fine'; b.style.color = 'var(--cream)'; b.textContent = 'Radio music: ';
    p.append(b, 'royalty-free recordings from Wikimedia Commons, used under the licences below. My Music plays files you add yourself; they never leave your browser.');
    d.className = 'fine rdCredits';
    for (const s of STATIONS) {
      const rows = songs.filter((r) => r.station === s.key); if (!rows.length) continue;
      const head = document.createElement('div'); head.className = 'rdSt'; head.textContent = s.name; d.append(head);
      for (const g of rows) {
        const row = document.createElement('div'), m = /^CC BY (\d\.\d)$/.exec(g.licence || ''), lic = document.createElement('a');
        row.append('"' + g.title + '" ' + g.performer + (/MacLeod/.test(g.performer) ? ' (incompetech.com)' : '') + (g.year ? ', ' + g.year : ''), document.createElement('br'));
        lic.target = '_blank'; lic.rel = 'noopener';
        if (m) { lic.href = 'https://creativecommons.org/licenses/by/' + m[1] + '/'; lic.textContent = 'Licensed under Creative Commons: By Attribution ' + m[1] + ' License'; }
        else if (/CC0/.test(g.licence)) { lic.href = 'https://creativecommons.org/publicdomain/zero/1.0/'; lic.textContent = 'CC0 1.0 Universal (public domain dedication)'; }
        else { lic.href = g.source || '#'; lic.textContent = g.licence || 'Public domain'; }
        row.append(lic);
        if (g.source) { const a = document.createElement('a'); a.href = g.source; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Commons page'; row.append(' · ', a); }
        if (g.note) row.append(' · ' + g.note);
        d.append(row);
      }
    }
    h.append(p, d);
  }
  Promise.all([
    fetch(BASE + 'credits.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    openDb(),
  ]).then(([c]) => {
    load(c); shuffle(); rebuild(); loaded = true; credits(); renderMine();
    if (started) tune(st);
  });
  renderMine();

  B.radio = {
    next, prev, off,
    setVolume(v) { setVolume(v); const e = evol(); if (e !== lastVol) { lastVol = e; el.volume = e; el.muted = e === 0; } },
    get station() { return st; },
    get stations() { return stations.map((s) => s.name); },
    get current() { return cur; },
  };
})();
