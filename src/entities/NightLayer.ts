import { Sprite, Texture } from 'pixi.js';

/**
 * The light of the hour: one screen-sized white sprite tinted with the sky colour and multiplied over the world, so
 * noon leaves the art as drawn and night turns it deep blue. It costs one quad; it hides itself in full daylight and in
 * rooms. It sits over the stage and under the door transition, so the iris stays black.
 */
export class NightLayer extends Sprite {
  constructor() {
    super(Texture.WHITE);
    this.blendMode = 'multiply';
    this.eventMode = 'none';
    this.visible = false;
  }

  /** Show the light (`DayClock.sky`) over a screen of this size, or nothing at all (`outdoors` false: a room). */
  update(color: number, outdoors: boolean, width: number, height: number) {
    this.visible = outdoors && color !== 0xffffff;
    if (!this.visible) return;
    this.tint = color;
    this.width = width;
    this.height = height;
  }
}
