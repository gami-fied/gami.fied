// The browser side. It never sees the API key: it asks our server for a player token,
// and gives that to the Gami.Fied elements.

const errorBox = document.getElementById('error');
const today = () => new Date().toISOString().slice(0, 10);

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

async function call(method, path) {
  const res = await fetch(path, { method, credentials: 'same-origin' });
  if (!res.ok)
    throw new Error((await res.json().catch(() => ({}))).error || 'Something went wrong.');
  return res.json();
}

/** Gets a fresh token, and asks for the next one a minute before this one runs out. */
async function connect(first) {
  const { token, expiresAt, baseUrl } = await call('GET', '/api/token');
  if (first) GamiElements.configure({ baseUrl, token });
  else GamiElements.setToken(token);
  const refreshIn = Math.max(new Date(expiresAt).getTime() - Date.now() - 60_000, 10_000);
  setTimeout(() => connect(false).catch((err) => showError(err.message)), refreshIn);
}

// The coin balance. The elements share one SDK client, so we can make our own calls with it.
const coinsBox = document.getElementById('coins');
async function showCoins() {
  const api = GamiElements.client();
  if (!api) return;
  try {
    const { data } = await api.me.wallets();
    const coins = data.find((wallet) => wallet.currency === 'coins');
    coinsBox.textContent = `🪙 ${coins ? coins.balance : 0}`;
  } catch {
    // Keep the last number shown; the next refresh will try again.
  }
}
/** Rewards are worked out in the background, so look again after a moment. */
function refreshCoinsSoon(...delays) {
  for (const delay of delays) setTimeout(showCoins, delay);
}
// The box tells us when it opens; buying a title is a click inside the locker.
document.addEventListener('gami-open', () => refreshCoinsSoon(0, 1500));
document
  .querySelector('gami-cosmetic-locker')
  .addEventListener('click', () => refreshCoinsSoon(800, 2500));
setInterval(showCoins, 20_000);

// Which habits are ticked today. The server does not need to know: Gami.Fied counts each
// habit once a day anyway. A real app would keep this in its own database.
const doneKey = () => `done:${today()}`;
function doneToday() {
  try {
    return new Set(JSON.parse(localStorage.getItem(doneKey()) || '[]'));
  } catch {
    return new Set();
  }
}
function markDone(habit) {
  const done = doneToday().add(habit);
  try {
    localStorage.setItem(doneKey(), JSON.stringify([...done]));
  } catch {
    // Private mode: the tick still counted, it just won't stay ticked after a reload.
  }
}

function paint() {
  const done = doneToday();
  for (const button of document.querySelectorAll('[data-habit]')) {
    const isDone = done.has(button.dataset.habit);
    button.classList.toggle('done', isDone);
    button.setAttribute('aria-pressed', String(isDone));
  }
}

document.getElementById('habit-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-habit]');
  if (!button || button.classList.contains('done')) return;
  button.disabled = true;
  try {
    await call('POST', `/api/habits/${button.dataset.habit}/done`);
    markDone(button.dataset.habit);
    showError('');
    refreshCoinsSoon(1500, 4000);
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
    paint();
  }
});

paint();
call('POST', '/api/session')
  .then(() => connect(true))
  .then(showCoins)
  .catch((err) => showError(err.message));
