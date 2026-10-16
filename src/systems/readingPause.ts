// The world standing still while people read a quest conversation. A dialog that `pauses` (an NPC's words, a quest
// brief) freezes foes, crops and weather for everyone until every player has read it, so nobody is beaten down while
// reading. Pure rules; the scene feeds it who is reading each frame (the host's own dialog, and each friend's
// `InputMsg.rd`). A friend who leaves the box open past `MAX_READ_S` stops holding the table up.

/** The longest one person's reading holds the world still (s). */
export const MAX_READ_S = 30;

export class ReadingPause {
  private reading = new Map<number, number>();

  /** Who is reading a pausing dialog this frame (player slots) and for how long (`dt`, s): true while the world stands still. */
  update(readers: Iterable<number>, dt: number): boolean {
    const now = new Set(readers);
    for (const slot of [...this.reading.keys()]) if (!now.has(slot)) this.reading.delete(slot);
    let paused = false;
    for (const slot of now) {
      const seconds = (this.reading.get(slot) ?? 0) + dt;
      this.reading.set(slot, seconds);
      if (seconds < MAX_READ_S) paused = true;
    }
    return paused;
  }

  /** Forget everyone (leaving a game). */
  clear() {
    this.reading.clear();
  }
}
