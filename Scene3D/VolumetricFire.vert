#version 330 core
// VolumetricFire.vert — a genuine GPU-simulated fire/smoke COLUMN rendered as
// a stack of 20 front-facing, additively-blended depth-slice billboards (the
// classic slice-based volume-rendering trick).  Each billboard samples ONE
// cell of the "texSmoke3D" atlas (see Blend/Smoke3DSim.frag): the cell's
// local (u,v) axes map directly to (world X, world Y=height) of that
// depth-slice, so the real per-cell buoyant rise the simulation computes
// shows up as the flame visibly climbing.  Reuses the 20-ribbon geometry
// (ri = attrA.w -> depth slice 0..19, t = attrA.x -> local X, side = attrA.y
// -> local Y edge) — the same "ribbons as arbitrary strips" trick as
// SciFiHUD.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioKick;
uniform float audioSwell;
uniform float audioDrop;
uniform float audioChromaHue;

out vec2  vAtlasUV;
out float vHeightFrac;
out float vHue;
out float vGlow;

const float COLS = 5.0;
const float ROWS = 4.0;

void main()
{
    float t    = attrA.x;            // 0..1 along the ribbon -> local X
    float side = attrA.y;            // -1 (base) .. +1 (top) -> local Y edge
    float ri   = attrA.w;            // 0..19 -> depth slice

    float col = mod(ri, COLS);
    float row = floor(ri / COLS);
    float vfrac = side * 0.5 + 0.5;  // 0 base .. 1 top

    vAtlasUV    = (vec2(col, row) + vec2(t, vfrac)) / vec2(COLS, ROWS);
    vHeightFrac = vfrac;
    vHue        = audioChromaHue;
    vGlow       = 1.4 + 0.9 * audioSwell + 1.7 * audioDrop;

    // The fire LEAPS on every kick (sharp upward flare, quick settle) and
    // breathes with the swell — an aggressive bonfire, not a candle.
    float pulse = 1.0 + 0.30 * audioKick + 0.10 * audioSwell
                + 0.05 * sin(time * 1.7);
    float width = 21.0 * (1.0 + 0.12 * audioKick);
    float baseY = -9.5;
    float topY  = 25.0 * pulse + baseY * (1.0 - pulse);

    vec3 local = vec3( (t - 0.5) * width,
                       mix(baseY, topY, vfrac),
                       0.0 );

    float sway = sin(time * 0.22) * 1.1 + sin(time * 0.55 + 1.7) * 0.4;
    float leanAmt = sway * (vfrac);            // more sway near the top, rooted at the base
    local.x += leanAmt;

    // Depth-slice stack: each ribbon sits a touch further from the camera —
    // reconstructs the volume's thickness (and gives free stereo parallax).
    vec3 world = local + vec3(0.0, 0.0, 24.0 + ri * 0.55);

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
}
