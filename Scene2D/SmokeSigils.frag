#version 330 core
out vec4 fragColor;
/**
 * @file SmokeSigils.frag
 * @brief SMOKE SIGILS: smoke blown through a lattice of glyphs.  A slab of
 * volumetric smoke (fbm, warped and driven on the scene clock) streams
 * upward; in its middle plane stands a grid of sigils -- procedural glyphs
 * cut from a cell hash -- and the smoke only shows where a glyph lets it
 * through, so the signs appear as shapes of moving smoke and vanish where
 * the smoke thins.  The melody lifts single glyphs into light (the class of
 * the note picks the column); the kick lights the lattice.  Nothing but
 * the smoke moves, and it moves continuously.
 *
 * Audio Reactivity:
 *   sceneAdvance     -> smoke flow (continuous)
 *   audioMelodyPitch -> which glyph column glows (light, smooth kernel)
 *   audioKick        -> lattice flash (light)
 *   audioSwell       -> smoke density (slow)
 *   audioLevel       -> brightness
 *
 * Per-activation variety: gridP (glyph size), densP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioMelodyPitch;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float gridP;
uniform float densP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x)
{
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise3(p); p = p * 2.07 + 5.1; a *= 0.5; }
    return v;
}

// A glyph in cell coordinates (0..1): strokes chosen by the cell's hash.
float glyph(vec2 q, vec2 cell)
{
    float g = 0.0;
    float h = hash21(cell);
    // Up to four strokes: vertical, horizontal, two diagonals, and a ring.
    float w = 0.09;
    if (hash21(cell + 1.0) > 0.35) g = max(g, 1.0 - smoothstep(w, w + 0.03, abs(q.x - 0.5)) * 1.0);
    if (hash21(cell + 2.0) > 0.45) g = max(g, 1.0 - smoothstep(w, w + 0.03, abs(q.y - 0.5)));
    if (hash21(cell + 3.0) > 0.55) g = max(g, 1.0 - smoothstep(w, w + 0.03, abs(q.x - q.y) * 0.7));
    if (hash21(cell + 4.0) > 0.55) g = max(g, 1.0 - smoothstep(w, w + 0.03, abs(q.x + q.y - 1.0) * 0.7));
    float ring = abs(length(q - 0.5) - 0.3);
    if (h > 0.4) g = max(g, 1.0 - smoothstep(w * 0.6, w * 0.6 + 0.03, ring));
    // Keep a margin so glyphs stay separate.
    float margin = smoothstep(0.02, 0.08, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)));
    return g * margin;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue  = (hueP > 0.001) ? hueP : 0.0;
    float cells = 5.0 + 4.0 * clamp(gridP, 0.0, 1.0);
    float dens = (0.8 + 0.6 * clamp(densP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float t = sceneAdvance * 0.6 + sceneTime * 0.12;

    // The lattice: which cell, which glyph.
    vec2 gc = (p + vec2(aspect * 0.5, 0.5)) * cells;
    vec2 cell = floor(gc);
    vec2 q = fract(gc);
    float gl = glyph(q, cell);

    // Smoke behind the lattice: a slab marched in depth, streaming upward
    // with a warp; the glyph is a mask on the middle plane, so the smoke
    // appears as the glyph's shape and only where the smoke is thick.
    vec3 col = vec3(0.0);
    float trans = 1.0;
    vec3 smokeCol = imgPalette(hue * 0.159 + 0.55);
    for (int i = 0; i < 16; ++i)
    {
        float z = float(i) / 16.0;
        vec3 sp = vec3(p * (1.5 + z), z * 2.0) + vec3(0.0, -t * 0.5, 0.0);
        vec3 warp = vec3(noise3(sp * 1.2 + t * 0.2), noise3(sp * 1.2 + 9.0 - t * 0.15), 0.0) - 0.5;
        float d = fbm(sp * 2.0 + warp * 0.8);
        d = clamp((d - 0.4) * 3.0 * dens, 0.0, 1.0);
        // The mask: strongest at the lattice plane (z ~ 0.5), open elsewhere
        // a little so the smoke also drifts between the signs.
        float plane = exp(-pow((z - 0.5) * 3.0, 2.0));
        float mask = mix(0.12, gl, plane);
        float absorb = d * mask * 0.35;
        float lit = 0.5 + 0.5 * z;
        col += smokeCol * lit * absorb * trans;
        trans *= exp(-absorb);
    }
    col *= 1.6 * (0.7 + 0.5 * audioLevel);

    // The melody lifts a column of glyphs: smooth kernel over the column
    // distance, so the light glides as the pitch glides.
    float colPos = clamp(audioMelodyPitch, 0.0, 0.999) * cells * aspect;
    float colDist = abs(cell.x + 0.5 - colPos);
    float lift = exp(-colDist * colDist * 1.2);
    col += imgPalette(hue * 0.159 + 0.1) * gl * lift * 0.8;
    // The lattice itself, faint, flashing on the kick.
    col += imgPalette(hue * 0.159 + 0.9) * gl * (0.05 + 0.35 * audioKick);
    // The photo far behind, dim.
    col += img(fract(p * 0.5 + 0.5)) * 0.05 * trans;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
