#version 330 core
out vec4 fragColor;
// BauhausGeo.frag
// -----------------------------------------------------------------------
// BAUHAUS GEOMETRY: a rotating composition of flat geometric primitives
// (discs, quarter-circle arcs, bars, triangles) on a grid — Kandinsky /
// Bauhaus poster style.  The palette is REDUCED and taken from the image
// (each panel samples its colour from the picture), so the artwork follows
// the photos and the music's mood.
//   snare  -> a hashed subset of panels flashes its accent (envelope, smooth)
//   barPhase -> a diagonal accent sweep crosses the grid once per bar
//   beat   -> the composition breathes minimally
//   arousal-> handled by the host's selection (complexity)
// Jump-free: panel spins ride time + audioPhase (integrated).
//
// Per-activation variety (0 = default):
//   gridP    int   grid resolution            (0 -> 5; 3..8)
//   paletteP float palette hue rotation       (0 -> none; 0..6.28)
//   spinP    float panel spin speed multiplier(0 -> 1.0; 0.5..1.5)
//   accentP  float accent flash strength      (0 -> 1.0; 0.5..1.6)
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioBeat;
uniform float audioSnare;
uniform float audioBarPhase;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;

uniform int   gridP;
uniform float paletteP;
uniform float spinP;
uniform float accentP;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

// Reduce an image colour to a poster colour: strong saturation, few steps.
vec3 poster(vec3 c)
{
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(lum), c, 1.8);                       // over-saturate
    c = floor(c * 4.0 + 0.5) / 4.0;                   // quantise
    return clamp(c, 0.0, 1.0);
}

void main()
{
    int   n    = (gridP  > 0)   ? gridP  : 5;
    float spin = (spinP  > 0.0) ? spinP  : 1.0;
    float acc  = (accentP > 0.0) ? accentP : 1.0;

    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Whole-canvas slow rotation + minimal beat breath.
    p = rot(time * 0.010 * spin + audioPhase * 0.03) * p;
    p /= (1.0 + 0.02 * audioBeat);

    float g = float(n);
    vec2  q    = p * g * 0.85;
    vec2  cell = floor(q);
    vec2  f    = fract(q) - 0.5;

    float h0 = hash21(cell * 1.31 + 17.0);            // per-panel identity
    float h1 = hash21(cell * 2.17 + 41.0);
    float h2 = hash21(cell * 3.71 + 73.0);

    // Panel-local slow spin (each panel its own rate & direction).
    float dir = (h1 > 0.5) ? 1.0 : -1.0;
    vec2  lf  = rot(dir * (time * 0.06 * spin * (0.4 + 0.8 * h2)
                           + audioPhase * 0.10)) * f;

    // Background paper: warm off-white with the image faintly pressed in.
    vec3 paper = vec3(0.92, 0.90, 0.85) * (0.90 + 0.10 * img(p * 0.3 + 0.5).r);
    paper *= 0.94 + 0.06 * hash21(cell + 5.0);

    // Panel colour: posterised image sample at the cell centre.
    vec3 inkc = poster(img(fract(cell / g + 0.5 / g + 0.31)));
    inkc = hueRot(inkc, paletteP);

    // Choose the primitive per panel.
    float shape = 0.0;
    float kind  = floor(h0 * 4.0);
    if (kind < 0.5)
    {
        // Disc (some as rings).
        float r = 0.30 + 0.10 * h2;
        float d = length(lf);
        shape = smoothstep(r, r - 0.03, d);
        if (h1 > 0.6) shape -= smoothstep(r - 0.10, r - 0.13, d);
        shape = clamp(shape, 0.0, 1.0);
    }
    else if (kind < 1.5)
    {
        // Quarter-circle arc in the panel corner.
        vec2 c0 = vec2(-0.5, -0.5);
        float d = length(lf - c0);
        shape = smoothstep(0.85, 0.82, d) - smoothstep(0.62, 0.59, d);
        shape = clamp(shape, 0.0, 1.0);
    }
    else if (kind < 2.5)
    {
        // Bar (horizontal in panel space).
        shape = smoothstep(0.16, 0.13, abs(lf.y)) * smoothstep(0.46, 0.43, abs(lf.x));
    }
    else
    {
        // Triangle.
        vec2  tf = lf * 1.5;
        float d  = max(abs(tf.x) * 0.866 + tf.y * 0.5, -tf.y * 0.6);
        shape = smoothstep(0.36, 0.33, d);
    }

    // Snare accent: a hashed ~quarter of the panels flashes its colour to
    // near-black ink (poster overprint feel) — envelope-driven, no strobe.
    float sel   = step(0.75, hash21(cell + 99.0));
    float flash = audioSnare * sel * acc;
    vec3  ink   = mix(inkc, vec3(0.10, 0.10, 0.12), clamp(flash, 0.0, 0.75));

    // Diagonal accent sweep once per bar: a soft band crossing the canvas.
    float sweep = 1.0 - smoothstep(0.00, 0.28,
                    abs(fract((p.x + p.y) * 0.35 - audioBarPhase) - 0.5));
    ink = mix(ink, hueRot(ink, 1.0), sweep * 0.35);

    vec3 col = mix(paper, ink, shape);

    // Thin grid seams (letterpress feel).
    vec2  seam = abs(f);
    float line = smoothstep(0.495, 0.5, max(seam.x, seam.y));
    col = mix(col, vec3(0.15, 0.14, 0.13), line * 0.5);

    // Mood grade (kept subtle: poster colours should stay graphic).
    col *= mix(vec3(0.88, 0.92, 1.06), vec3(1.08, 1.00, 0.88), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.75 + 0.4 * audioValence);
    col *= 0.90 + 0.25 * audioLevel;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
