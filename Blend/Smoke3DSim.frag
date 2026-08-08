// Smoke3DSim.frag
// -----------------------------------------------------------------------
// GPU volumetric fire/smoke simulation: a real 3D field faked as a 2D-tiled
// atlas ("virtual 3D texture" — same trick as light/shadow atlases).  The
// atlas is COLS x ROWS square cells; each cell is one Z-DEPTH cross-section
// of the volume (a front-facing plane).  WITHIN a cell, the local (u,v) axes
// are (world X, world Y = height/rise) — so buoyancy ("fire rises") is just
// texel-space upward advection inside a single cell, and puffiness across
// depth comes from a light blend with the neighbouring cells.
//
// Driven by FilterShader::stepSmoke3D(), which runs this shader TWICE per
// frame on the same ping-pong pair (mirrors the RD sim's multi-substep
// pattern):
//   subStep 0 (horizontal): per-cell curl turbulence + base fuel injection
//                            (a few wandering emitter points) + decay.
//   subStep 1 (vertical):   buoyant rise (sample the texel BELOW) blended
//                            with a touch of the neighbour depth-cells
//                            (softens the between-slice seams) + cooling.
//
// R = temperature (hot core > 1.0 for the white-hot flash), G = density
// (smoke, persists and cools longer than the flame itself).
// -----------------------------------------------------------------------

uniform sampler2D texPrev;
uniform vec2  resolution;      // full atlas size in pixels
uniform float seedMode;        // 1 on the very first frame -> clear to black
uniform float subStep;         // 0 = horizontal pass, 1 = vertical pass
uniform float time;
uniform float turbulence;      // audio treble/onset -> per-cell swirl strength
uniform float injectAmt;       // audio kick/bass/drop -> base injection strength
uniform float emitterPhase;    // integrated (jump-free) wander phase for emitters

const float TILE = 64.0;
const float COLS = 5.0;
const float ROWS  = 4.0;
const float NSLICES = COLS * ROWS;   // 20

vec2 tileOrigin(float slice)
{
    float col = mod(slice, COLS);
    float row = floor(slice / COLS);
    return vec2(col, row) * TILE;
}

// Sample a texel by its LOCAL (0..TILE) position inside a given depth slice,
// clamped to stay inside that one cell (never bleeds into the neighbour).
vec4 sampleSlice(float slice, vec2 localPx)
{
    slice = clamp(slice, 0.0, NSLICES - 1.0);
    vec2 o  = tileOrigin(slice);
    vec2 lp = clamp(localPx, vec2(0.5), vec2(TILE - 0.5));
    return texture2D(texPrev, (o + lp) / resolution);
}

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

void main()
{
    vec2  fragPx = gl_FragCoord.xy;
    float col    = floor(fragPx.x / TILE);
    float row    = floor(fragPx.y / TILE);
    float slice  = row * COLS + col;
    vec2  local  = mod(fragPx, TILE);          // 0..TILE local pixel in the cell

    if (seedMode > 0.5)
    {
        gl_FragColor = vec4(0.0);
        return;
    }
    if (slice >= NSLICES)
    {
        gl_FragColor = vec4(0.0);              // unused atlas margin, if any
        return;
    }

    if (subStep < 0.5)
    {
        // ---------------- Horizontal pass: turbulence + injection + decay ----------------
        float a    = time * 0.55 + slice * 0.35;
        vec2  curl = vec2(cos(a + local.y * 0.14), sin(a * 1.3 + local.x * 0.14)) * turbulence;
        vec4  adv  = sampleSlice(slice, local - curl * 1.6);

        vec4 blur = ( sampleSlice(slice, local + vec2(1.0, 0.0))
                    + sampleSlice(slice, local - vec2(1.0, 0.0))
                    + sampleSlice(slice, local + vec2(0.0, 1.0))
                    + sampleSlice(slice, local - vec2(0.0, 1.0)) ) * 0.25;
        vec4 mixed = mix(adv, blur, 0.30);

        // A handful of wandering emitters near the base (v small) of EVERY
        // depth-cell, each cell's emitters jittered by a per-slice hash (time-
        // independent -> no flicker) so the 20 stacked billboards show real
        // per-depth variation instead of 20 identical copies reinforcing one
        // flat blob.  Fuel is clamped to 0..1 before use: bounded EQUILIBRIUM
        // injection (add-then-decay settles at inj*coef/(1-decay), never an
        // unbounded blow-up), so the ember->flame->white-hot gradient actually
        // has room to show instead of every emitter instantly clamping white.
        float inj = 0.0;
        if (local.y < TILE * 0.30)
        {
            float sj0 = hash21(vec2(slice, 11.0)) - 0.5;
            float sj1 = hash21(vec2(slice, 23.0)) - 0.5;
            float sj2 = hash21(vec2(slice, 37.0)) - 0.5;
            float sj3 = hash21(vec2(slice, 53.0)) - 0.5;
            vec2 c0 = vec2(0.5 + 0.30 * sin(emitterPhase * 1.7)       + sj0 * 0.30, 0.16) * TILE;
            vec2 c1 = vec2(0.5 + 0.30 * cos(emitterPhase * 1.3 + 2.1) + sj1 * 0.30, 0.10) * TILE;
            vec2 c2 = vec2(0.5 + 0.28 * sin(emitterPhase * 2.1 + 4.2) + sj2 * 0.30, 0.20) * TILE;
            vec2 c3 = vec2(0.5 + 0.28 * cos(emitterPhase * 1.9 + 1.1) + sj3 * 0.30, 0.08) * TILE;
            float f0 = 0.65 + 0.35 * hash21(vec2(0.0, floor(time * 8.0)));
            float f1 = 0.65 + 0.35 * hash21(vec2(1.0, floor(time * 8.0)));
            float f2 = 0.65 + 0.35 * hash21(vec2(2.0, floor(time * 8.0)));
            float f3 = 0.65 + 0.35 * hash21(vec2(3.0, floor(time * 8.0)));
            inj += smoothstep(10.0, 0.0, distance(local, c0)) * f0;
            inj += smoothstep(9.0,  0.0, distance(local, c1)) * f1;
            inj += smoothstep(8.0,  0.0, distance(local, c2)) * f2;
            inj += smoothstep(9.0,  0.0, distance(local, c3)) * f3;
            inj = clamp(inj, 0.0, 1.0);
        }
        float fuel = inj * clamp(injectAmt, 0.0, 1.4);

        float temp = mixed.r * 0.940 + fuel * 0.115;
        float dens = mixed.g * 0.965 + fuel * 0.075;
        gl_FragColor = vec4(clamp(temp, 0.0, 3.0), clamp(dens, 0.0, 2.0), 0.0, 0.0);
    }
    else
    {
        // ---------------- Vertical pass: buoyant rise + cross-depth softening ----------------
        vec4 below = sampleSlice(slice, local - vec2(0.0, 1.6));   // pull upward
        vec4 above = sampleSlice(slice, local + vec2(0.0, 1.6));
        vec4 here  = sampleSlice(slice, local);

        vec4 depthPrev = sampleSlice(slice - 1.0, local);
        vec4 depthNext = sampleSlice(slice + 1.0, local);

        vec4 risen = mix(here, below, 0.55);
        risen = mix(risen, above, 0.06);
        risen = mix(risen, (depthPrev + depthNext) * 0.5, 0.05);

        float heightFrac = local.y / TILE;                 // 0 base .. 1 top
        float cool = 0.006 + 0.014 * heightFrac;
        float temp = risen.r * (1.0 - cool);
        float dens = risen.g * (1.0 - cool * 0.55);

        gl_FragColor = vec4(clamp(temp, 0.0, 3.0), clamp(dens, 0.0, 2.0), 0.0, 0.0);
    }
}
