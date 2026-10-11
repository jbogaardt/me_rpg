import type { Application, Container } from 'pixi.js';
import { input } from './input';

/** One screen of the game (overworld, dungeon, title...). The SceneManager owns which one is running. */
export interface Scene {
  /** Added to the stage while the scene is active. */
  readonly root: Container;
  /** Called once the scene is on the stage, before its first update/resize. */
  enter(): void;
  /** Advance by `dt` seconds (already clamped). */
  update(dt: number): void;
  /** The screen size changed (CSS px), or the DOM overlays moved. */
  resize(width: number, height: number): void;
  /** Called when another scene replaces this one; release DOM listeners and timers here. */
  exit(): void;
}

const MAX_DT = 0.1; // a stalled tab shouldn't turn into one giant step

/** Runs one scene at a time from the app ticker and forwards resizes. */
export class SceneManager {
  private current: Scene | null = null;

  constructor(private app: Application) {
    app.renderer.on('resize', () => this.resize());
  }

  change(scene: Scene) {
    if (this.current) {
      this.current.exit();
      this.app.stage.removeChild(this.current.root);
      this.current.root.destroy({ children: true });
    }
    this.current = scene;
    this.app.stage.addChild(scene.root);
    scene.enter();
    this.resize();
  }

  /** Re-lay-out the current scene (e.g. when the on-screen controls appear). */
  resize() {
    const { width, height } = this.app.screen;
    this.current?.resize(width, height);
  }

  start() {
    this.app.ticker.add((t) => {
      try {
        this.current?.update(Math.min(t.deltaMS / 1000, MAX_DT));
      } finally {
        input.endFrame(); // always clear one-shot presses, even if the scene threw or returned early
      }
    });
  }
}
