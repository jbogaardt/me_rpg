// If the game throws, say so on the screen (with which build this is) instead of leaving a page that looks alive and does
// nothing: a dead game and a cached old page look the same to the player, and the build number tells them apart. It lists
// the first few different errors (the first is not always the one that matters), each with where it happened, and has a ✕.
// textContent only. Browser noise that is not the game's (a resize observer note) is ignored.

const IGNORE = /ResizeObserver loop/i;
const MAX_LINES = 3;

/** "message [top two stack frames, without the long file paths]". */
function describe(what: unknown): string {
  const text = (what instanceof Error ? what.message : String(what)).slice(0, 160);
  if (!(what instanceof Error) || !what.stack) return text;
  const frames = what.stack
    .split('\n')
    .slice(1, 3)
    .map((l) =>
      l
        .trim()
        .replace(/^at /, '')
        .replace(/\(?https?:\/\/[^ )]*\//, '('),
    )
    .join(' < ')
    .slice(0, 200);
  return frames ? `${text} [${frames}]` : text;
}

export function installProblemBanner() {
  console.info(`me_rpg build ${__BUILD_ID__}`);
  const seen = new Set<string>();
  let list: HTMLUListElement | null = null;
  const show = (what: unknown) => {
    const line = describe(what);
    if (IGNORE.test(line) || seen.has(line) || seen.size >= MAX_LINES) return;
    seen.add(line);
    if (!list) {
      const box = document.createElement('div');
      box.id = 'problem';
      box.setAttribute('role', 'alert');
      const head = document.createElement('p');
      head.textContent = `Something went wrong (build ${__BUILD_ID__.slice(0, 8)}). If the game is stuck, hard-refresh (Ctrl+Shift+R) and tell the developer this:`;
      list = document.createElement('ul');
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '✕';
      close.setAttribute('aria-label', 'Dismiss');
      close.addEventListener('click', () => box.remove());
      box.append(head, list, close);
      document.body.append(box);
    }
    const item = document.createElement('li');
    item.textContent = line;
    list.append(item);
  };
  window.addEventListener('error', (e) => show(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => show(e.reason));
}
