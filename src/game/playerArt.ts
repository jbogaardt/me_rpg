// Pixel art for the hero: a boy stranded outside of time, carrying a glowing clock pendant.
// Pure data (no Pixi imports) so it can be previewed outside the browser.
// Frames are 16x24: head (12 rows) + torso (7 rows) + legs (5 rows).
// Only "down", "up" and "side" (facing right) are authored; facing left mirrors "side".

export const FRAME_W = 16;
export const FRAME_H = 24;

export type Facing = 'down' | 'up' | 'side';
export type Pose = 'idle' | 'stepA' | 'stepB';

export const PALETTE: Record<string, string> = {
  o: '#1b1230', // outline
  h: '#5a3a2a', // hair
  H: '#8a5a3a', // hair highlight
  w: '#dff3ff', // pale "time-touched" streak in the hair
  s: '#f2b98d', // skin
  S: '#d08a63', // skin shadow
  e: '#22224a', // eyes
  b: '#3a5fcf', // tunic
  B: '#26398f', // tunic shadow / pants
  C: '#eaffff', // pendant core
  c: '#4de3ff', // pendant glow
  g: '#e8b73a', // gold trim
  k: '#6b3f26', // boots
};

const HEAD: Record<Facing, string[]> = {
  down: [
    '....oooooooo....',
    '...ohhhhhhhho...',
    '..ohhHHhhhhhho..',
    '..ohwHhhhhhhho..',
    '..ohwhhhhhhhho..',
    '..ohhhssssshho..',
    '..ohseesseesho..',
    '..ohseesseesho..',
    '...osssSSssso...',
    '....osssssso....',
    '.....oSSSSo.....',
    '....obbggbbo....',
  ],
  up: [
    '....oooooooo....',
    '...ohhhhhhhho...',
    '..ohhHHhhhhhho..',
    '..ohHhhhhhhhho..',
    '..ohhhhhhhhhho..',
    '..ohhhhhhhhhho..',
    '..ohhhhhhhhhho..',
    '..ohhhhhhhhhho..',
    '...ohhhhhhhho...',
    '....ohhhhhho....',
    '.....oSSSSo.....',
    '....obbbbbbo....',
  ],
  side: [
    '....oooooooo....',
    '...ohhhhhhhho...',
    '..ohhHHhhhhhho..',
    '..ohhwhhhhhhho..',
    '..ohhhhhhhsssso.',
    '..ohhhhhhssseso.',
    '..ohhhhhhsssssso',
    '..ohhhhhhsssSSo.',
    '...ohhhhhssssso.',
    '....ohhhhsssso..',
    '.....ohSSSo.....',
    '....obbggbbo....',
  ],
};

const TORSO: Record<Facing, string[]> = {
  down: [
    '..obbbbbbbbbbo..',
    '..oBbbbCCbbbBo..',
    '..oBbbbccbbbBo..',
    '..oggggggggggo..',
    '..oBBBBBBBBBBo..',
    '..osBBBBBBBBso..',
    '....oBBBBBBo....',
  ],
  up: [
    '..obbbbbbbbbbo..',
    '..oBbbbbbbbbBo..',
    '..oBbbggggbbBo..',
    '..oggggggggggo..',
    '..oBBBBBBBBBBo..',
    '..osBBBBBBBBso..',
    '....oBBBBBBo....',
  ],
  side: [
    '...obbbbbbbbo...',
    '...obbbbbCCbo...',
    '...obbBBbbcbo...',
    '...oggggggggo...',
    '...oBBBBBBBBo...',
    '...oBBBssBBBo...',
    '....oBBBBBBo....',
  ],
};

const LEGS: Record<Facing, Record<Pose, string[]>> = {
  down: {
    idle: [
      '....oBBBBBBo....',
      '....oBBooBBo....',
      '....okkookko....',
      '...okkkookkko...',
      '...oooo..oooo...',
    ],
    stepA: [
      '....oBBBBBBo....',
      '....oBBooBBo....',
      '...okkkookko....',
      '...oooo.okkko...',
      '.........oooo...',
    ],
    stepB: [
      '....oBBBBBBo....',
      '....oBBooBBo....',
      '....okkookkko...',
      '...okkko.oooo...',
      '...oooo.........',
    ],
  },
  up: {
    idle: [
      '....oBBBBBBo....',
      '....oBBooBBo....',
      '....okkookko....',
      '...okkkookkko...',
      '...oooo..oooo...',
    ],
    stepA: [
      '....oBBBBBBo....',
      '....oBBooBBo....',
      '...okkkookko....',
      '...oooo.okkko...',
      '.........oooo...',
    ],
    stepB: [
      '....oBBBBBBo....',
      '....oBBooBBo....',
      '....okkookkko...',
      '...okkko.oooo...',
      '...oooo.........',
    ],
  },
  side: {
    idle: [
      '....oBBBBBo.....',
      '....oBBBBBo.....',
      '....okkkkko.....',
      '...okkkkkko.....',
      '...oooooooo.....',
    ],
    stepA: [
      '....oBBBBBo.....',
      '...oBBo.oBBo....',
      '..okkko.okko....',
      '..okkko.okkko...',
      '..ooooo.ooooo...',
    ],
    stepB: [
      '....oBBBBBo.....',
      '...oBBo.oBBo....',
      '..okkko.okko....',
      '..okkko.okkko...',
      '..ooooo.ooooo...',
    ],
  },
};

export function composeFrame(facing: Facing, pose: Pose): string[] {
  return [...HEAD[facing], ...TORSO[facing], ...LEGS[facing][pose]];
}
