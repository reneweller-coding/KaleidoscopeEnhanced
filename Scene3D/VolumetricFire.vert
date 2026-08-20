#version 330 core
/**
 * @file VolumetricFire.vert
 * @brief Vertex stage companion to VolumetricFire.frag -- see that file's header for
 * this scene's description.
 */
// VolumetricFire.vert — a genuine GPU-simulated fire/smoke rendered as stacks
// of 20 front-facing, additively-blended depth-slice billboards (the classic
// slice-based volume-rendering trick).  Each billboard samples ONE cell of the
// "texSmoke3D" atlas (see Blend/Smoke3DSim.frag): the cell's local (u,v) axes
// map directly to (world X, world Y=height) of that depth-slice, so the real
// per-cell buoyant rise the simulation computes shows up as the flame visibly
// climbing.  Reuses the 20-ribbon geometry (ri = attrA.w -> depth slice 0..19,
// t = attrA.x -> local X, side = attrA.y -> local Y edge) — the same "ribbons
// as arbitrary strips" trick as SciFiHUD.
//
// A single column left most of the frame black, so the 300 segments of every
// ribbon are now split into FIVE runs: five separate fires standing at
// different depths, placed in FRUSTUM coordinates so they span the picture
// edge to edge whatever depth each one sits at.  Every fire still gets all
// twenty depth slices.  Each run's billboard height tapers to exactly zero at
// both ends of its run (which is also the natural silhouette of a flame), so
// the one quad that bridges two runs collapses to zero area and no sheet is
// ever drawn across the gap between fires.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

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
const float FIRES = 5.0;
// The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
const float kTanY = 0.5206;

void main()
{
    float t    = attrA.x;            // 0..1 along the ribbon
    float side = attrA.y;            // -1 (base) .. +1 (top) -> local Y edge
    float ri   = attrA.w;            // 0..19 -> depth slice

    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // Which fire this stretch of the ribbon belongs to, and where across it.
    float j = min(floor(t * FIRES), FIRES - 1.0);
    float u = clamp(t * FIRES - j, 0.0, 1.0);

    float acol = mod(ri, COLS);
    float arow = floor(ri / COLS);
    float vfrac = side * 0.5 + 0.5;  // 0 base .. 1 top

    // Each fire takes a different crop (and every other one a mirrored crop)
    // of its slice cell, so five fires read as five fires rather than as one
    // flame stamped five times.  The crop stays well inside the cell so no
    // sampling ever bleeds into a neighbouring depth slice.
    float flip = (mod(j, 2.0) < 0.5) ? 1.0 : -1.0;
    float au   = clamp(0.5 + flip * (u - 0.5) * (0.62 + 0.07 * j), 0.0, 1.0);
    float av   = clamp(vfrac * (0.80 + 0.10 * mod(j, 3.0)), 0.0, 1.0);

    vAtlasUV    = (vec2(acol, arow) + vec2(au, av)) / vec2(COLS, ROWS);
    vHeightFrac = vfrac;
    vHue        = audioChromaHue;
    // Five fires add up where they overlap, so each one burns a little
    // cooler than the lone column used to.
    vGlow       = 1.15 + 0.70 * audioSwell + 1.20 * audioDrop;

    // Zero at BOTH ends of the run: the flame narrows to nothing at its own
    // left and right edge, and the quad that straddles two runs degenerates.
    float hTap = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.88, 0.98, u));

    // ---- Where this fire stands -------------------------------------
    // Depth-slice stack: each ribbon sits a touch further from the camera —
    // reconstructs the volume's thickness (and gives free stereo parallax).
    // The frustum half-extents are taken at THIS SLICE's depth, so all twenty
    // slices of one fire project to the same size on screen instead of
    // tapering away into a funnel behind the front slice.
    float cz    = 21.0 + fract(j * 0.371 + 0.27) * 17.0;      // depth 21..38
    float dz    = cz + ri * 0.55;
    float halfH = dz * kTanY;                                  // frustum half-height
    float halfW = halfH * aspect;

    // Stratified across the picture; the outer pair reaches past the edges.
    float sx = ((j + 0.5) / FIRES - 0.5) * 2.0 * 0.88
             + (fract(j * 0.727 + 0.41) - 0.5) * 0.10;
    float sw = 0.26 + 0.10 * fract(j * 0.913 + 0.19);          // half-width on screen

    // The fire LEAPS on every kick (sharp upward flare, quick settle) and
    // breathes with the swell — an aggressive bonfire, not a candle.
    float pulse = 1.0 + 0.30 * audioKick + 0.10 * audioSwell
                + 0.05 * sin(time * 1.7 + j * 1.3);

    // Bases sit just below the bottom edge, tips reach the top edge or past
    // it (the flame fades into smoke long before then), so no horizontal band
    // of the picture is left empty.
    float baseY = -1.06 * halfH;
    float tipY  = (1.05 + 0.55 * fract(j * 0.517 + 0.63)) * halfH;
    float topY  = mix(baseY, tipY, pulse);

    // EVERY term that moves a vertex uses vv, never vfrac on its own: with
    // vv the run's two end columns collapse to a single point each, so the
    // quad bridging two fires has zero area and is never rasterised.
    float vv = vfrac * hTap;

    // Wider at the bed, narrowing into the tongue.
    float widen = 1.0 + 0.55 * (1.0 - vv);
    float lx    = (u - 0.5) * 2.0 * sw * widen * halfW * (1.0 + 0.12 * audioKick);

    vec3 local = vec3(sx * halfW + lx,
                      mix(baseY, topY, vv),
                      0.0);

    float sway = sin(time * 0.22 + j * 2.1) * 1.1 + sin(time * 0.55 + 1.7 + j) * 0.4;
    local.x += sway * vv * sw * halfW * 0.20;   // leans at the tip, rooted at the base

    vec3 world = local + vec3(0.0, 0.0, dz);

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
}
