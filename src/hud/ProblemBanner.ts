// If the game throws, say so on the screen (with which build this is) instead of leaving a page that looks alive and does
// nothing: a dead game and a cached old page look the same to the player, and the build number tells them apart. Shown once,
// with a ✕; textContent only. Browser noise that is not the game's (a resize observer note) is ignored.

const IGNORE = /ResizeObserver loop/i;

export function installProblemBanner() {
  console.info(`me_rpg build ${__BUILD_ID__}`);
  let shown = false;
  const show = (what: unknown) => {
    const text = what instanceof Error ? what.message : String(what);
    if (shown || IGNORE.test(text)) return;
    shown = true;
    const box = document.createElement('div');
    box.id = 'problem';
    box.setAttribute('role', 'alert');
    const words = document.createElement('p');
    words.textContent = `Something went wrong (build ${__BUILD_ID__.slice(0, 8)}): ${text.slice(0, 160)}. If the game is stuck, hard-refresh (Ctrl+Shift+R) and tell the developer this message.`;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', () => box.remove());
    box.append(words, close);
    document.body.append(box);
  };
  window.addEventListener('error', (e) => show(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => show(e.reason));
}
