import { defaultFilterVert, Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { ViewRect } from '../core/camera';
import { BAYER4 } from '../systems/darkLook';

const f = (n: number | undefined) => (n ?? 0).toFixed(1);
/** The 4x4 table as GLSL ES 1.00 branches (Pixi compiles filters without `#version 300 es`, which has no constant arrays). */
const bayerBody = [0, 1, 2, 3]
  .map((y) => {
    const row = [0, 1, 2, 3].map((x) => BAYER4[y * 4 + x]);
    return `${y === 0 ? '' : 'else '}${y === 3 ? '' : `if (y < ${y}.5) `}{ r = x < 0.5 ? ${f(row[0])} : (x < 1.5 ? ${f(row[1])} : (x < 2.5 ? ${f(row[2])} : ${f(row[3])})); }`;
  })
  .join('\n    ');

/**
 * One world pixel is one dither cell: the smooth light mask (a small canvas stretched over the screen) is cut into
 * `levels` flat steps, and between two steps each pixel picks one by a 4x4 ordered-dither table anchored to the WORLD, so
 * the stipple sits still on the floor when the camera moves. `mode` 0 paints the dark (`fog` colour at the stepped alpha,
 * `peak` the alpha of the darkest step); 1 steps a light's own colour (the additive glow). It runs on the GPU in the one
 * pass the sprite is drawn in, so there is nothing read back and nothing allocated per frame. WebGL only (the game asks
 * for WebGL first).
 */
const fragment = `
precision highp float; // the filter vertex shader's uInputSize is highp: the two must agree to link
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uView;   // the world rect on screen: x, y, w, h (world px)
uniform vec4 uLook;   // levels, peak alpha, mode (0 dark, 1 glow), unused
uniform vec3 uFog;

float bayer(vec2 cell)
{
    float x = mod(cell.x, 4.0);
    float y = mod(cell.y, 4.0);
    float r = 0.0;
    ${bayerBody}
    return (r + 0.5) / 16.0;
}

void main(void)
{
    vec2 ratio = uOutputFrame.zw * uInputSize.zw;
    vec2 frame = vTextureCoord / ratio;
    vec2 world = uView.xy + frame * uView.zw;
    vec2 cell = floor(world);
    vec2 centre = ((cell + 0.5 - uView.xy) / uView.zw) * ratio;
    vec4 m = texture(uTexture, centre);
    float thr = bayer(cell);
    float t = clamp(m.a / uLook.y, 0.0, 1.0);
    float level = min(floor(t * uLook.x + thr), uLook.x);
    float q = level / uLook.x;
    if (uLook.z < 0.5) {
        float a = q * uLook.y;
        finalColor = vec4(uFog * a, a);
    } else {
        finalColor = m.a > 0.0 ? m * (q * uLook.y / m.a) : vec4(0.0);
    }
}
`;

export class DitherFilter extends Filter {
  private view: Float32Array;
  constructor(
    levels: number,
    peak: number,
    mode: 0 | 1,
    fog = 0,
    // The shader's uniform names are fixed; this group is the only resource.
    private group = new UniformGroup({
      uView: { value: new Float32Array(4), type: 'vec4<f32>' },
      uLook: { value: new Float32Array([levels, peak, mode, 0]), type: 'vec4<f32>' },
      uFog: {
        value: new Float32Array([(fog >> 16) / 255, ((fog >> 8) & 255) / 255, (fog & 255) / 255]),
        type: 'vec3<f32>',
      },
    }),
  ) {
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'dither-filter' }),
      resources: { ditherUniforms: group },
    });
    this.view = group.uniforms.uView;
  }

  /** Where the world is on screen now (the camera's view), so the stipple stays fixed to the ground. */
  setView(view: ViewRect) {
    const v = this.view;
    v[0] = view.x;
    v[1] = view.y;
    v[2] = view.w;
    v[3] = view.h;
  }

  /** The darkest step's alpha (the `dim` setting). */
  setPeak(peak: number) {
    (this.group.uniforms.uLook as Float32Array)[1] = peak;
  }
}
