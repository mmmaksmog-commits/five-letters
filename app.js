import { WORDS } from './words.js';

const ROWS = 6;
const LEN = 5;
const EPOCH = new Date(2026, 0, 1);
const KEYS = ['йцукенгшщзхъ', 'фывапролджэ', '↵ячсмитьбю⌫'];
// Английская раскладка → русская (чтобы на ПК можно было печатать, не переключая язык)
const EN_TO_RU = Object.fromEntries([...'qwertyuiop[]asdfghjkl;\'zxcvbnm,.'].map((c, i) => [c, 'йцукенгшщзхъфывапролджэячсмитьбю'[i]]));

const $ = (s) => document.querySelector(s);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(`fl_${k}`)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(`fl_${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
};

const dayIndex = () => Math.floor((Date.now() - EPOCH.getTime()) / 864e5);
// Перемешиваем список детерминированно, чтобы слова дня не шли по алфавиту
const DAILY = [...WORDS].sort((a, b) => hash(a) - hash(b));
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

let mode = 'daily';
let game;

// ---------- Логика ----------
/** Оценка попытки с учётом повторяющихся букв. */
export function evaluate(guess, answer) {
  const res = Array(LEN).fill('absent');
  const left = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (res[i] !== 'correct' && left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
  }
  return res;
}

function newGame(m) {
  if (m === 'daily') {
    const day = dayIndex();
    const saved = store.get('daily', null);
    if (saved && saved.day === day) return saved;
    return { day, answer: DAILY[((day % DAILY.length) + DAILY.length) % DAILY.length], guesses: [], done: false, won: false };
  }
  const saved = store.get('free', null);
  if (saved && !saved.done) return saved;
  return { answer: WORDS[Math.floor(Math.random() * WORDS.length)], guesses: [], done: false, won: false };
}

function save() { store.set(mode, game); }

// ---------- Отрисовка ----------
let current = '';

function renderBoard(revealRow = -1) {
  $('#board').innerHTML = Array.from({ length: ROWS }, (_, r) => {
    const guess = game.guesses[r];
    const marks = guess ? evaluate(guess, game.answer) : null;
    const text = guess ?? (r === game.guesses.length ? current : '');
    const cells = Array.from({ length: LEN }, (_, c) => {
      const ch = text[c] ?? '';
      const cls = marks ? `s-${marks[c]}` : ch ? 'is-filled' : '';
      const anim = r === revealRow ? ` style="animation-delay:${c * 0.25}s" data-reveal` : '';
      return `<span class="tile ${cls}"${anim}>${ch}</span>`;
    }).join('');
    return `<div class="row" data-row="${r}">${cells}</div>`;
  }).join('');
}

function keyStates() {
  const rank = { absent: 1, present: 2, correct: 3 };
  const st = {};
  for (const g of game.guesses) {
    evaluate(g, game.answer).forEach((m, i) => { if (!st[g[i]] || rank[m] > rank[st[g[i]]]) st[g[i]] = m; });
  }
  return st;
}

function renderKeyboard() {
  const st = keyStates();
  $('#keyboard').innerHTML = KEYS.map((row) => `<div class="krow">${[...row].map((k) => {
    if (k === '↵') return '<button class="key key--wide" data-key="enter">Ввод</button>';
    if (k === '⌫') return '<button class="key key--wide" data-key="back" aria-label="Стереть">⌫</button>';
    return `<button class="key ${st[k] ? `s-${st[k]}` : ''}" data-key="${k}">${k}</button>`;
  }).join('')}</div>`).join('');
}

function toast(text, ms = 1600) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  if (ms) toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

function shakeRow() {
  const row = $(`[data-row="${game.guesses.length}"]`);
  row.classList.remove('shake');
  void row.offsetWidth;
  row.classList.add('shake');
}

// ---------- Ввод ----------
function press(key) {
  if (game.done) return;
  if (key === 'enter') return submit();
  if (key === 'back') current = current.slice(0, -1);
  else if (current.length < LEN && /^[а-я]$/.test(key)) current += key;
  else return;
  renderBoard();
}

function submit() {
  if (current.length < LEN) { toast('Нужно 5 букв'); shakeRow(); return; }
  if (game.guesses.includes(current)) { toast('Это слово уже было'); shakeRow(); return; }
  game.guesses.push(current);
  const won = current === game.answer;
  current = '';
  const row = game.guesses.length - 1;
  renderBoard(row);
  setTimeout(renderKeyboard, LEN * 250 + 200);

  if (won || game.guesses.length === ROWS) {
    game.done = true;
    game.won = won;
    recordStats(won, game.guesses.length);
    setTimeout(() => {
      if (won) {
        $(`[data-row="${row}"]`).classList.add('win');
        toast(['Гениально!', 'Великолепно!', 'Отлично!', 'Хорошо!', 'Неплохо!', 'Фух, успели!'][row], 2200);
      } else toast(`Загаданное слово: ${game.answer.toUpperCase()}`, 0);
      setTimeout(() => openStats(), 1800);
    }, LEN * 250 + 300);
  }
  save();
}

// ---------- Статистика ----------
function recordStats(won, tries) {
  const s = store.get('stats', { played: 0, wins: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] });
  s.played++;
  if (won) { s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); s.dist[tries - 1]++; } else s.streak = 0;
  store.set('stats', s);
}

function openStats() {
  const s = store.get('stats', { played: 0, wins: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] });
  const items = [[s.played, 'Сыграно'], [s.played ? Math.round((s.wins / s.played) * 100) : 0, '% побед'], [s.streak, 'Серия'], [s.best, 'Лучшая']];
  $('#statRow').innerHTML = items.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  const max = Math.max(1, ...s.dist);
  const last = game.done && game.won ? game.guesses.length - 1 : -1;
  $('#dist').innerHTML = s.dist.map((n, i) => `<div class="dist__row"><span>${i + 1}</span><i class="${i === last ? 'is-last' : ''}" style="width:${Math.max(8, (n / max) * 100)}%">${n}</i></div>`).join('');

  const res = $('#result');
  if (game.done) {
    res.innerHTML = `${mode === 'daily' ? `<p>Новое слово через <b id="countdown"></b></p>` : ''}
      <div class="result__btns">
        <button class="btn" id="shareBtn">Поделиться</button>
        ${mode === 'free' ? '<button class="btn btn--primary" id="againBtn">Новое слово</button>' : ''}
      </div>`;
    $('#shareBtn').onclick = share;
    if ($('#againBtn')) $('#againBtn').onclick = () => { closeModals(); store.set('free', null); start('free'); };
    tickCountdown();
  } else res.innerHTML = '';
  $('#stats').hidden = false;
}

function tickCountdown() {
  const el = $('#countdown');
  if (!el) return;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.floor((next - now) / 1000);
  el.textContent = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  clearTimeout(tickCountdown.t);
  tickCountdown.t = setTimeout(tickCountdown, 1000);
}

async function share() {
  const emoji = { correct: '🟩', present: '🟨', absent: '⬛' };
  const grid = game.guesses.map((g) => evaluate(g, game.answer).map((m) => emoji[m]).join('')).join('\n');
  const title = `5 букв ${mode === 'daily' ? `#${game.day + 1}` : ''} ${game.won ? game.guesses.length : 'X'}/6`;
  const text = `${title}\n${grid}\n${location.href}`;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast('Результат скопирован'); }
  } catch { /* отменено */ }
}

// ---------- Модальные окна и режимы ----------
function closeModals() { document.querySelectorAll('.modal').forEach((m) => { m.hidden = true; }); }

function start(m) {
  mode = m;
  game = newGame(m);
  current = '';
  document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === m));
  $('#toast').hidden = true;
  renderBoard();
  renderKeyboard();
  save();
}

document.addEventListener('click', (e) => {
  const key = e.target.closest('[data-key]');
  if (key) { press(key.dataset.key); key.blur(); return; }
  const open = e.target.closest('[data-open]');
  if (open) { if (open.dataset.open === 'stats') openStats(); else $(`#${open.dataset.open}`).hidden = false; return; }
  if (e.target.closest('[data-close]') || e.target.classList.contains('modal')) return closeModals();
  const m = e.target.closest('[data-mode]');
  if (m && m.dataset.mode !== mode) start(m.dataset.mode);
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') return closeModals();
  if (!document.querySelectorAll('.modal:not([hidden])').length) {
    const k = e.key.toLowerCase().replace('ё', 'е');
    if (k === 'enter') press('enter');
    else if (k === 'backspace') press('back');
    else if (/^[а-я]$/.test(k)) press(k);
    else if (EN_TO_RU[k]) press(EN_TO_RU[k]);
    else return;
    e.preventDefault();
  }
});

start('daily');
if (!store.get('seenHelp', false)) { $('#help').hidden = false; store.set('seenHelp', true); }
