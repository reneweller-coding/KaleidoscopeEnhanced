#version 330 core
/**
 * @file MelodyScript.vert
 * @brief Vertex stage companion to MelodyScript.frag -- see that file's header for
 * this scene's description.
 */
// MelodyScript.vert — the MELODY writes itself: the host keeps ~7.7 s of
// dominant-pitch history (audioMelody[96], ring with audioMelodyHead) and
// this scene draws it as a glowing handwriting line scrolling right to
// left — pitch is height, silence lifts the pen (gap in the line), fast
// melodic movement (deltaPitch) heats the ink.  The missing link between
// the oscilloscope (time signal) and the spectrum (frequency): the TUNE
// as a line.  The engine's feedback trails give the script its afterglow.
//
// SCREEN-FILL PASS: the manuscript used to be a 26 x 13 world-unit card in the
// middle of a 56 x 31 frame, ruled by five hairlines 0.06 units thick — one
// faint squiggle on a black field (occ 0.11).  The stave is now sized FROM THE
// FRUSTUM so it runs past every edge, the rules are a full nine-line system
// with measure bars, and the tune is doubled at the octave above and below,
// which is the same idea written wider rather than a different scene.
//
// 20 ribbons routed by index (ri = attrA.w):
//   0     main melody trace (thick core)
//   1     glow copy (wider, dimmer)
//   2..3  octave doublings of the same tune (+1 / -1 octave, dim)
//   4..12 nine stave rules, full frame width
//   13    measure bar lines (9 packed, ends faded so the packing seam is dark)
//   14    "now" playhead (vertical, right side)
//   15..19 accent strokes riding the trace (8 packed per ribbon, on onsets)

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioMelody[96];
uniform float audioMelodyHead;
uniform float audioDeltaPitch;
uniform float audioOnset;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioLevel;

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hashH(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Melody sample at history position h (0 oldest .. 1 newest), ring-unwrapped.
float melodyRing(float h)
{
    float idx = mod(h * 95.0 + audioMelodyHead * 96.0, 96.0);
    int   i0  = int(idx);
    float fr  = fract(idx);
    int   i1  = int(mod(float(i0 + 1), 96.0));
    return mix(audioMelody[i0], audioMelody[i1], fr);
}

// FALLBACK tune: when the host's melody history is empty (probe render,
// silence, instrumental with no dominant pitch) the pen still writes — a
// quantised wandering line with rests, so the scene never shows just the
// empty stave the user reported.
float synthMelody(float h)
{
    float ph   = h * 11.0 - time * 1.4;
    float stp  = floor(ph);
    float note = 0.5 + 0.30 * sin(stp * 1.7) * sin(stp * 0.61 + 2.0);
    float rest = step(0.13, fract(stp * 0.377));
    return note * rest;
}

float melodyAt(float h)
{
    float energy = audioMelody[0] + audioMelody[24] + audioMelody[48] + audioMelody[72];
    return (energy < 0.02) ? synthMelody(h) : melodyRing(h);
}

void main()
{
    float t  = attrA.x;
    float sd = attrA.y;
    float ri = attrA.w;

    // The manuscript is sized from the frustum (55 deg vertical FOV) at the
    // stave's own depth, so it reaches past every edge on any aspect ratio.
    const float kTanY = 0.5206;
    const float kDepth = 30.0;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
    float halfH  = kDepth * kTanY;
    float halfW  = halfH * aspect;

    float W = halfW * 2.06;                // stave width  (runs off both edges)
    float H = halfH * 1.86;                // pitch range height
    const float OCT = 1.0 / 6.0;           // the stave spans six octaves

    vec2  pos;
    vec3  col;
    float alpha = 1.0;

    if (ri < 1.5)                          // melody trace + glow copy
    {
        bool glow = ri > 0.5;
        float m = melodyAt(t);
        float y = (m - 0.5) * H;
        // Stroke widths below are in WORLD units at depth 30, where one unit is
        // ~35 px of a 1080-line frame: the pen is ~10 px, its glow ~29 px, the
        // stave rules ~8 px.  (The old rules were 0.03 -> two pixels, which is
        // what averaged the whole manuscript away to luma 0.010.)
        pos = vec2((t - 0.5) * W, y + sd * (glow ? 0.42 : 0.15));
        // Pen up where no pitch: fade the line out instead of drawing zero.
        alpha = smoothstep(0.015, 0.06, m);
        // Ink heat: melodic activity makes the line burn warmer.
        vec3 cold = hueRot(vec3(0.25, 0.75, 1.0), audioChromaHue * 0.5);
        vec3 hot  = hueRot(vec3(1.0, 0.55, 0.15), audioChromaHue * 0.5);
        col = mix(cold, hot, clamp(audioDeltaPitch * 2.0, 0.0, 1.0));
        col *= glow ? 0.20 : 0.62;
        // Newest end glows brightest (the pen tip).
        col *= 0.45 + 0.9 * smoothstep(0.55, 1.0, t);
    }
    else if (ri < 3.5)                     // the same tune, one octave up / down
    {
        float dir = (ri < 2.5) ? 1.0 : -1.0;
        float m = melodyAt(t);
        float y = (clamp(m + dir * OCT, 0.0, 1.0) - 0.5) * H;
        pos = vec2((t - 0.5) * W, y + sd * 0.12);
        alpha = smoothstep(0.015, 0.06, m);
        col = hueRot(vec3(0.30, 0.62, 0.95), audioChromaHue * 0.5) * 0.26;
        col *= 0.45 + 0.9 * smoothstep(0.55, 1.0, t);
    }
    else if (ri < 12.5)                    // nine stave rules, full width
    {
        float line = ri - 4.0;             // 0..8
        pos = vec2((t - 0.5) * W, (line / 8.0 - 0.5) * H + sd * 0.115);
        // Every second rule a little stronger, so the system reads as a stave
        // and not as graph paper.
        float weight = (mod(line, 2.0) < 0.5) ? 1.0 : 0.62;
        col = vec3(0.26, 0.32, 0.44) * 0.52 * weight;
        alpha = 0.85;
    }
    else if (ri < 13.5)                    // measure bar lines (9 packed)
    {
        float tt = t * 9.0;
        float bar = floor(tt);
        float lf  = fract(tt);
        // lf runs bottom -> top of one bar line; the ends fade to nothing so
        // the quad that bridges two packed elements is invisible.
        pos = vec2((bar / 8.0 - 0.5) * W * 0.94 + sd * 0.085, (lf - 0.5) * H);
        col = vec3(0.22, 0.30, 0.42) * 0.50;
        alpha = sin(lf * 3.14159265);
    }
    else if (ri < 14.5)                    // "now" playhead
    {
        pos = vec2(W * 0.47, (t - 0.5) * H);
        pos.x += sd * 0.13;
        col = hueRot(vec3(1.0, 0.8, 0.4), audioChromaHue * 0.5)
            * (0.5 + 0.6 * audioOnset) * 0.55;
    }
    else                                    // accent strokes on the trace
    {
        float k  = ri - 15.0;               // 0..4
        float tt = t * 8.0;
        float s  = floor(tt);               // which of the 8 packed strokes
        float lf = fract(tt);
        float ht = fract(hashH(k * 7.7 + s * 3.1) + floor(time * 0.4) * 0.13);
        float m  = melodyAt(ht);
        // A short vertical accent stroke standing on the trace.
        pos = vec2((ht - 0.5) * W + sd * 0.12,
                   (m - 0.5) * H + (lf - 0.5) * H * 0.055);
        col = vec3(1.0, 0.95, 0.8) * 0.60;
        alpha = smoothstep(0.02, 0.06, m) * (0.25 + 0.75 * audioOnset)
              * sin(lf * 3.14159265);
    }

    vec3 vp = vec3(pos.x, pos.y, 0.0) + vec3(0.0, 0.0, kDepth);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;

    col *= (0.8 + 0.4 * audioSwell + 0.9 * audioDrop)
         * (0.85 + 0.3 * audioLevel);
    // Additive ink: the stave, the doublings and the trace all overlap, so a
    // single stroke has to stay well clear of white on its own.
    vCol = vec4(min(col * 2.6 * alpha, vec3(0.66)), 1.0);
}
