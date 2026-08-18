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
// 20 ribbons routed by index (ri = attrA.w):
//   0     main melody trace (thick core)
//   1     glow copy (wider, dimmer)
//   2..6  octave grid lines (dim horizontal rules)
//   7     "now" playhead (vertical, right side)
//   8..19 sparkle ticks riding the trace (accents on onsets)

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

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

    const float W = 26.0;                  // stave width
    const float H = 13.0;                  // pitch range height

    vec2  pos;
    vec3  col;
    float alpha = 1.0;

    if (ri < 2.5)                          // melody trace + glow copy
    {
        bool glow = ri > 0.5;
        float m = melodyAt(t);
        float y = (m - 0.5) * H;
        pos = vec2((t - 0.5) * W, y + sd * (glow ? 0.55 : 0.16));
        // Pen up where no pitch: fade the line out instead of drawing zero.
        alpha = smoothstep(0.015, 0.06, m);
        // Ink heat: melodic activity makes the line burn warmer.
        vec3 cold = hueRot(vec3(0.25, 0.75, 1.0), audioChromaHue * 0.5);
        vec3 hot  = hueRot(vec3(1.0, 0.55, 0.15), audioChromaHue * 0.5);
        col = mix(cold, hot, clamp(audioDeltaPitch * 2.0, 0.0, 1.0));
        col *= glow ? 0.30 : 1.0;
        // Newest end glows brightest (the pen tip).
        col *= 0.45 + 0.9 * smoothstep(0.55, 1.0, t);
    }
    else if (ri < 7.5)                     // octave grid rules
    {
        float line = ri - 2.0;             // 1..5
        pos = vec2((t - 0.5) * W, (line / 6.0 - 0.5) * H + sd * 0.03);
        col = vec3(0.25, 0.30, 0.40) * 0.35;
        alpha = 0.6;
    }
    else if (ri < 8.5)                     // "now" playhead
    {
        pos = vec2(0.5 * W + 0.15, (t - 0.5) * H + sd * 0.0);
        pos.x += sd * 0.05;
        col = hueRot(vec3(1.0, 0.8, 0.4), audioChromaHue * 0.5)
            * (0.5 + 0.6 * audioOnset);
    }
    else                                    // sparkle ticks on the trace
    {
        float k  = ri - 8.0;                // 0..11
        float ht = fract(hashH(k * 7.7) + floor(time * 0.4) * 0.13);
        float m  = melodyAt(ht);
        pos = vec2((ht - 0.5) * W, (m - 0.5) * H) + (vec2(t, sd) - 0.5) * 0.5;
        col = vec3(1.0, 0.95, 0.8);
        alpha = smoothstep(0.02, 0.06, m) * audioOnset
              * exp(-length(vec2(t, sd) - 0.5) * 3.0);
    }

    vec3 vp = vec3(pos.x, pos.y, 0.0) + vec3(0.0, 0.0, 30.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;

    col *= (0.8 + 0.4 * audioSwell + 0.9 * audioDrop)
         * (0.85 + 0.3 * audioLevel);
    vCol = vec4(col * 2.6 * alpha, 1.0);
}
