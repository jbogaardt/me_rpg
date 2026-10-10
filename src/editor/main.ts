import { Application, Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import { MapView, makeFrame } from '../map/MapView';
import { SHEET_FILES, fetchMap, loadSheets, tilesetUrl } from '../map/sheets';
import { CELL, createEmptyMap, parseMap, resizeMap, type MapData, type MapObject } from '../map/types';

type Tool = 'ground' | 'object' | 'collision' | 'spawn' | 'npc';
interface Selection { sheet: string; x: number; y: number; w: number; h: number }

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'ground', label: '1 Ground', hint: 'Stamp the selected region onto the 32px grid. Right-click clears a cell.' },
  { id: 'object', label: '2 Object', hint: 'Place the selected sprite (trees, rocks…) with its bottom-center at the cursor. Right-click removes.' },
  { id: 'collision', label: '3 Collision', hint: 'Paint blocked cells (red). Right-click clears. The player cannot walk through them.' },
  { id: 'spawn', label: '4 Spawn', hint: 'Click a cell to set where the player starts.' },
  { id: 'npc', label: '5 NPC', hint: 'Click to place the NPC. Right-click removes it.' },
];

const AUTOSAVE_KEY = 'me_rpg.map.autosave';
const OBJECT_SNAP = 8;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

(async () => {
  // ---- Pixi map view -------------------------------------------------------------------------
  const host = $('map');
  const app = new Application();
  await app.init({ background: '#1a1a2e', resizeTo: host, antialias: false });
  host.appendChild(app.canvas);
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const textures = await loadSheets(SHEET_FILES);
  let data = await loadInitialMap();
  const view = new MapView(data, textures);
  const cam = new Container();
  const grid = new Graphics();
  const overlay = new Graphics(); // collision cells
  const markers = new Container();
  const ghost = new Container();
  const spawnMarker = makeMarker('S', 0x4dff88);
  const npcMarker = makeMarker('N', 0xff6b8a);
  markers.addChild(spawnMarker, npcMarker);
  cam.addChild(view, overlay, grid, markers, ghost);
  cam.position.set(20, 20);
  app.stage.addChild(cam);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  // ---- State ---------------------------------------------------------------------------------
  let tool: Tool = 'ground';
  let selection: Selection | null = null;
  let spaceDown = false;
  let panning = false;
  let stroke: { erase: boolean; col: number; row: number; undoPushed: boolean } | null = null;
  let lastWorld = { x: 0, y: 0 };
  const undoStack: string[] = [];
  let saveTimer = 0;

  // ---- Helpers -------------------------------------------------------------------------------
  function status(msg: string, isError = false) {
    const el = $('status');
    el.textContent = msg;
    el.style.color = isError ? '#ff8a8a' : '#9fe6a0';
  }

  function makeMarker(letter: string, color: number): Container {
    const c = new Container();
    c.addChild(new Graphics().circle(0, 0, 12).fill({ color, alpha: 0.85 }).stroke({ color: 0x000000, width: 2 }));
    const t = new Text({ text: letter, style: { fill: 0x000000, fontSize: 14, fontWeight: 'bold' } });
    t.anchor.set(0.5);
    c.addChild(t);
    return c;
  }

  async function loadInitialMap(): Promise<MapData> {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        status('Loaded your unsaved autosave. "Reload project map" discards it.');
        return parseMap(JSON.parse(saved));
      }
    } catch { /* ignore bad/blocked storage */ }
    try {
      return await fetchMap();
    } catch {
      return createEmptyMap(40, 28);
    }
  }

  function sheetIndex(name: string): number {
    let i = data.sheets.indexOf(name);
    if (i < 0) i = data.sheets.push(name) - 1;
    return i;
  }

  function cellOf(x: number, y: number) {
    return { col: Math.floor(x / CELL), row: Math.floor(y / CELL) };
  }
  const inMap = (col: number, row: number) => col >= 0 && row >= 0 && col < data.width && row < data.height;
  const snap = (v: number, step: number) => Math.round(v / step) * step;

  // ---- Undo / persistence --------------------------------------------------------------------
  function pushUndo() {
    undoStack.push(JSON.stringify(data));
    if (undoStack.length > 60) undoStack.shift();
  }

  function replaceMap(next: MapData) {
    data = next;
    view.rebuild(data);
    refreshAll();
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return status('Nothing to undo.');
    replaceMap(parseMap(JSON.parse(prev)));
    scheduleAutosave();
  }

  function scheduleAutosave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    }, 300);
  }

  function clearAutosave() {
    window.clearTimeout(saveTimer);
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'overworld.json' });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveToProject() {
    if (import.meta.env.DEV) {
      const res = await fetch('/__save-map', { method: 'POST', body: JSON.stringify(data) });
      if (res.ok) {
        clearAutosave();
        return status('Saved to public/maps/overworld.json — commit and push to deploy.');
      }
      return status(`Save failed: ${await res.text()}`, true);
    }
    download();
    status('Downloaded. Put it in public/maps/overworld.json and commit. (Direct save only works with `npm run dev`.)');
  }

  // ---- Overlays ------------------------------------------------------------------------------
  function drawGrid() {
    grid.clear();
    const w = data.width * CELL, h = data.height * CELL;
    for (let c = 0; c <= data.width; c++) grid.moveTo(c * CELL, 0).lineTo(c * CELL, h);
    for (let r = 0; r <= data.height; r++) grid.moveTo(0, r * CELL).lineTo(w, r * CELL);
    grid.stroke({ color: 0xffffff, alpha: 0.12, width: 1 });
    grid.rect(0, 0, w, h).stroke({ color: 0xffffff, alpha: 0.6, width: 2 });
    grid.visible = ($('showGrid') as HTMLInputElement).checked;
  }

  function drawCollision() {
    overlay.clear();
    for (const i of data.collision) overlay.rect((i % data.width) * CELL, Math.floor(i / data.width) * CELL, CELL, CELL);
    overlay.fill({ color: 0xff2d2d, alpha: 0.4 });
    overlay.visible = ($('showCol') as HTMLInputElement).checked;
  }

  function drawMarkers() {
    spawnMarker.position.set((data.spawn.col + 0.5) * CELL, (data.spawn.row + 0.5) * CELL);
    npcMarker.visible = !!data.npc;
    if (data.npc) npcMarker.position.set((data.npc.col + 0.5) * CELL, (data.npc.row + 0.5) * CELL);
  }

  function refreshAll() {
    ($('mw') as HTMLInputElement).value = String(data.width);
    ($('mh') as HTMLInputElement).value = String(data.height);
    drawGrid();
    drawCollision();
    drawMarkers();
    refreshGhost();
  }

  // ---- Ghost (cursor preview) ----------------------------------------------------------------
  function groundRect(sel: Selection) {
    const x0 = Math.floor(sel.x / CELL) * CELL, y0 = Math.floor(sel.y / CELL) * CELL;
    const x1 = Math.ceil((sel.x + sel.w) / CELL) * CELL, y1 = Math.ceil((sel.y + sel.h) / CELL) * CELL;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function refreshGhost() {
    ghost.removeChildren().forEach((c) => c.destroy({ children: true, texture: true }));
    const sheet = selection && textures.get(selection.sheet);
    if (selection && sheet && tool === 'ground') {
      const r = groundRect(selection);
      for (let j = 0; j < r.h / CELL; j++) for (let i = 0; i < r.w / CELL; i++) {
        const t = makeFrame(sheet, r.x + i * CELL, r.y + j * CELL, CELL, CELL);
        if (!t) continue;
        const sp = new Sprite(t);
        sp.position.set(i * CELL, j * CELL);
        ghost.addChild(sp);
      }
      ghost.alpha = 0.7;
    } else if (selection && sheet && tool === 'object') {
      const t = makeFrame(sheet, selection.x, selection.y, selection.w, selection.h);
      if (t) ghost.addChild(new Sprite(t));
      ghost.alpha = 0.7;
    } else {
      ghost.addChild(new Graphics().rect(0, 0, CELL, CELL).stroke({ color: 0xffe14d, width: 2 }));
      ghost.alpha = 1;
    }
    moveGhost();
  }

  function moveGhost() {
    const { x, y } = lastWorld;
    if (tool === 'object' && selection) {
      ghost.position.set(snap(x - selection.w / 2, OBJECT_SNAP), snap(y - selection.h, OBJECT_SNAP));
    } else {
      const { col, row } = cellOf(x, y);
      ghost.position.set(col * CELL, row * CELL);
    }
  }

  // ---- Editing actions -----------------------------------------------------------------------
  function paintGround(col: number, row: number, erase: boolean) {
    if (erase) {
      if (inMap(col, row)) view.setGround(col, row, null);
      return;
    }
    if (!selection) return;
    const r = groundRect(selection);
    const s = sheetIndex(selection.sheet);
    for (let j = 0; j < r.h / CELL; j++) for (let i = 0; i < r.w / CELL; i++) {
      const sx = r.x + i * CELL, sy = r.y + j * CELL;
      if (!inMap(col + i, row + j) || !cellHasPixels(selection.sheet, sx, sy)) continue;
      view.setGround(col + i, row + j, [s, sx, sy]);
    }
  }

  function paintCollision(col: number, row: number, erase: boolean) {
    if (!inMap(col, row)) return;
    const idx = row * data.width + col;
    const at = data.collision.indexOf(idx);
    if (erase && at >= 0) data.collision.splice(at, 1);
    else if (!erase && at < 0) data.collision.push(idx);
    else return;
    drawCollision();
  }

  function objectAt(x: number, y: number): MapObject | undefined {
    return data.objects
      .filter((o) => x >= o.px && x < o.px + o.w && y >= o.py && y < o.py + o.h)
      .sort((a, b) => b.py + b.h - (a.py + a.h))[0];
  }

  function applyAt(world: { x: number; y: number }, erase: boolean, first: boolean) {
    const { col, row } = cellOf(world.x, world.y);
    switch (tool) {
      case 'ground': paintGround(col, row, erase); break;
      case 'collision': paintCollision(col, row, erase); break;
      case 'object': {
        if (!first) return; // objects are placed one click at a time
        if (erase) {
          const hit = objectAt(world.x, world.y);
          if (hit) view.removeObject(hit);
        } else if (selection) {
          view.addObject({
            s: sheetIndex(selection.sheet), x: selection.x, y: selection.y, w: selection.w, h: selection.h,
            px: snap(world.x - selection.w / 2, OBJECT_SNAP), py: snap(world.y - selection.h, OBJECT_SNAP),
          });
        }
        break;
      }
      case 'spawn': if (inMap(col, row) && !erase) data.spawn = { col, row }; break;
      case 'npc': if (inMap(col, row)) data.npc = erase ? null : { col, row }; break;
    }
    drawMarkers();
  }

  // ---- Pointer / keyboard on the map ---------------------------------------------------------
  const toWorld = (e: FederatedPointerEvent) => cam.toLocal(e.global);

  app.stage.on('pointerdown', (e) => {
    if (e.button === 1 || spaceDown) { panning = true; return; }
    if (e.button !== 0 && e.button !== 2) return;
    const w = toWorld(e);
    const { col, row } = cellOf(w.x, w.y);
    pushUndo();
    stroke = { erase: e.button === 2, col, row, undoPushed: true };
    applyAt(w, stroke.erase, true);
  });

  app.stage.on('pointermove', (e) => {
    if (panning) { cam.position.x += e.movementX; cam.position.y += e.movementY; return; }
    const w = toWorld(e);
    lastWorld = w;
    moveGhost();
    if (!stroke) return;
    const { col, row } = cellOf(w.x, w.y);
    if (col === stroke.col && row === stroke.row) return;
    stroke.col = col; stroke.row = row;
    applyAt(w, stroke.erase, false);
  });

  const endStroke = () => {
    panning = false;
    if (stroke) scheduleAutosave();
    stroke = null;
  };
  app.stage.on('pointerup', endStroke);
  app.stage.on('pointerupoutside', endStroke);

  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = cam.toLocal({ x: e.offsetX, y: e.offsetY });
    const scale = Math.min(4, Math.max(0.25, cam.scale.x * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    cam.scale.set(scale);
    cam.position.set(e.offsetX - before.x * scale, e.offsetY - before.y * scale);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const typing = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT';
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); void saveToProject(); return; }
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
    if (typing) return;
    if (e.code === 'Space') { spaceDown = true; e.preventDefault(); }
    const n = Number(e.key);
    if (n >= 1 && n <= TOOLS.length) setTool(TOOLS[n - 1].id);
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

  // ---- Sidebar: tools ------------------------------------------------------------------------
  const toolRow = $('tools');
  function setTool(next: Tool) {
    tool = next;
    toolRow.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tool === next));
    $('hint').textContent = TOOLS.find((t) => t.id === next)!.hint;
    refreshGhost();
  }
  TOOLS.forEach((t) => {
    const b = Object.assign(document.createElement('button'), { textContent: t.label });
    b.dataset.tool = t.id;
    b.onclick = () => setTool(t.id);
    toolRow.appendChild(b);
  });

  // ---- Sidebar: tileset picker ---------------------------------------------------------------
  const sheetSel = $<HTMLSelectElement>('sheet');
  const img = $<HTMLImageElement>('img');
  const wrap = $('wrap');
  const selBox = $('sel');
  const pixelCache = new Map<string, { w: number; h: number; data: Uint8ClampedArray }>();
  const pickerZoom = () => Number($<HTMLSelectElement>('szoom').value);
  const snapStep = () => Math.max(1, Number($<HTMLInputElement>('snap').value) || CELL);

  SHEET_FILES.forEach((f) => sheetSel.add(new Option(f, f)));

  async function pixels(name: string) {
    let p = pixelCache.get(name);
    if (!p) {
      const im = new Image();
      im.src = tilesetUrl(name);
      await im.decode();
      const canvas = document.createElement('canvas');
      canvas.width = im.naturalWidth;
      canvas.height = im.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(im, 0, 0);
      p = { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
      pixelCache.set(name, p);
    }
    return p;
  }

  function cellHasPixels(name: string, sx: number, sy: number): boolean {
    const p = pixelCache.get(name);
    if (!p) return true;
    for (let y = sy; y < Math.min(sy + CELL, p.h); y++) for (let x = sx; x < Math.min(sx + CELL, p.w); x++) {
      if (p.data[(y * p.w + x) * 4 + 3] >= 16) return true;
    }
    return false;
  }

  /** Bounding box of the connected opaque blob under (x, y). */
  async function componentAt(name: string, x: number, y: number) {
    const p = await pixels(name);
    const opaque = (i: number) => p.data[i * 4 + 3] >= 16;
    if (x < 0 || y < 0 || x >= p.w || y >= p.h || !opaque(y * p.w + x)) {
      const cx = Math.floor(x / CELL) * CELL, cy = Math.floor(y / CELL) * CELL;
      return { x: cx, y: cy, w: CELL, h: CELL };
    }
    const seen = new Uint8Array(p.w * p.h);
    const stack = [y * p.w + x];
    seen[stack[0]] = 1;
    let minX = x, maxX = x, minY = y, maxY = y;
    while (stack.length) {
      const i = stack.pop()!;
      const px = i % p.w, py = (i / p.w) | 0;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) continue;
        const j = ny * p.w + nx;
        if (!seen[j] && opaque(j)) { seen[j] = 1; stack.push(j); }
      }
    }
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function showSelection() {
    const z = pickerZoom();
    if (!selection || selection.sheet !== sheetSel.value) { selBox.style.display = 'none'; return; }
    Object.assign(selBox.style, {
      display: 'block', left: `${selection.x * z}px`, top: `${selection.y * z}px`,
      width: `${selection.w * z}px`, height: `${selection.h * z}px`,
    });
  }

  async function showSheet() {
    await pixels(sheetSel.value);
    img.src = tilesetUrl(sheetSel.value);
    await img.decode();
    img.style.width = `${img.naturalWidth * pickerZoom()}px`;
    showSelection();
  }
  sheetSel.onchange = showSheet;
  $('szoom').onchange = showSheet;

  const pickerPoint = (ev: MouseEvent) => {
    const r = img.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / pickerZoom(), y: (ev.clientY - r.top) / pickerZoom() };
  };

  wrap.addEventListener('mousedown', (down) => {
    down.preventDefault();
    const start = pickerPoint(down);
    let dragged = false;
    const move = (ev: MouseEvent) => {
      const cur = pickerPoint(ev);
      if (Math.hypot(cur.x - start.x, cur.y - start.y) * pickerZoom() > 4) dragged = true;
      if (!dragged) return;
      const step = snapStep();
      const x0 = Math.floor(Math.min(start.x, cur.x) / step) * step;
      const y0 = Math.floor(Math.min(start.y, cur.y) / step) * step;
      const x1 = Math.ceil(Math.max(start.x, cur.x) / step) * step;
      const y1 = Math.ceil(Math.max(start.y, cur.y) / step) * step;
      selection = { sheet: sheetSel.value, x: x0, y: y0, w: Math.max(step, x1 - x0), h: Math.max(step, y1 - y0) };
      showSelection();
    };
    const up = async (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!dragged) {
        const p = pickerPoint(ev);
        selection = { sheet: sheetSel.value, ...(await componentAt(sheetSel.value, Math.floor(p.x), Math.floor(p.y))) };
        showSelection();
      }
      refreshGhost();
      if (selection) status(`Selected ${selection.w}×${selection.h} at (${selection.x}, ${selection.y})`);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  // ---- Sidebar: buttons ----------------------------------------------------------------------
  $('showGrid').onchange = drawGrid;
  $('showCol').onchange = drawCollision;
  $('save').onclick = () => void saveToProject();
  $('download').onclick = download;
  $('undo').onclick = undo;
  $('resize').onclick = () => {
    const w = Number($<HTMLInputElement>('mw').value), h = Number($<HTMLInputElement>('mh').value);
    if (!(w >= 5 && h >= 5)) return status('Size must be at least 5×5.', true);
    pushUndo();
    replaceMap(resizeMap(data, w, h));
    scheduleAutosave();
  };
  $('new').onclick = () => {
    if (!confirm('Start a blank map? (Undo can bring the old one back.)')) return;
    pushUndo();
    replaceMap(createEmptyMap(Number($<HTMLInputElement>('mw').value) || 40, Number($<HTMLInputElement>('mh').value) || 28));
    scheduleAutosave();
  };
  $('reload').onclick = async () => {
    if (!confirm('Discard unsaved edits and reload public/maps/overworld.json?')) return;
    try {
      pushUndo();
      replaceMap(await fetchMap());
      clearAutosave();
      status('Reloaded project map.');
    } catch (err) {
      status(String(err), true);
    }
  };
  const fileInput = $<HTMLInputElement>('file');
  $('load').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const next = parseMap(JSON.parse(await f.text()));
      pushUndo();
      replaceMap(next);
      scheduleAutosave();
      status(`Loaded ${f.name}`);
    } catch (err) {
      status(String(err), true);
    }
  };

  // ---- Go ------------------------------------------------------------------------------------
  setTool('ground');
  refreshAll();
  await showSheet();
})();
