#version 330 core
out vec4 fragColor;
/**
 * @file OilProjector.frag
 * @brief 1960s liquid light-show / Mathmos Space Projector - but now the swirling oil
 * cells REFRACT the source image: the picture is folded on the glass wheel and
 * dragged through the domain-warped flow, with dark oil veins between the cells
 * and a harmony-driven iridescent tint.  The *image* is the star (was a 10%
 * tint).  Bass + onset are the "heat" that makes it bubble, the beat gives an
 * in-tempo zoom pulse, treble crisps the veins, stereo skews the flow, harmony
 * drives the palette.  Rotation/evolution use jump-free phases (anti-flicker).
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;     // integrated rotation phase (jump-free)
uniform float audioAdvance;   // integrated evolution drift (audio-rate)
uniform float audioBass;
uniform float audioBeat;
uniform float audioBeatPhase;
uniform float audioOnset;
uniform float audioValence;
uniform float audioCentroid;
uniform float audioStereo;
uniform float audioSwell;     // slow loudness swell -> the "heat" of the oil

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   sidesP;         // mirror fold count (0 -> 4; 2..8)
uniform float cellP;          // oil cell scale    (0 -> 2.0; 1.4 = broad, 3.0 = fine)
uniform float audioChromaHue;

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, amp = 0.5;
    for (int i = 0; i < 4; i++) { v += amp * noise(p); p *= 2.0; amp *= 0.5; }
    return v;
}

vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
}

void main()
{
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // The glass wheel rotates slowly; an in-tempo zoom pulse breathes the cells.
    p = rot(time * 0.05 + audioPhase * 0.18) * p;
    p *= 1.0 - 0.04 * audioSwell;

    // Fold count is FIXED per activation (a floor(audio) fold used to snap the
    // whole frame whenever the valence crossed a step -> abrupt changes).
    float sides = float((sidesP >= 2) ? sidesP : 4);
    vec2  fp    = kaleido(p, sides);
    float cellS = (cellP <= 0.01) ? 2.0 : cellP;

    float t    = time * 0.08 + audioAdvance * 0.30;
    // "Heat" must be SLOW: it displaces the whole cell field, so driving it
    // with per-beat bass/onset made everything shiver.  The slow swell (plus a
    // whisper of bass) keeps the bubbling calm but still loudness-coupled.
    float heat = 0.7 + 0.45 * audioSwell + 0.20 * audioBass;

    vec2 asym = vec2(audioStereo * 0.15 * sin(fp.y * 3.0 + t), 0.0);
    vec2 q    = vec2(fbm(fp * cellS + vec2(0.0, t) + asym),
                     fbm(fp * cellS + vec2(5.2, t * 1.1) - asym));
    vec2 r    = fp * cellS * 1.25 + heat * q + vec2(t * 0.5, 0.0);
    float cells = fbm(r * 1.5);

    // Dark oil veins along the cell boundaries (crisper with treble).
    float vein = smoothstep(0.45, 0.50, abs(cells - 0.5) * 2.0);

    // The oil flow refracts the folded picture.
    vec2 iuv = fp * 0.6 + 0.5 + (q - 0.5) * (0.12 + 0.10 * audioBass);
    vec3 pic = img(fract(iuv));

    // Iridescent tint drifting with the cells.  The tint hue moves only via
    // SLOW terms (the jumpy chroma-hue snap was the "abrupt colour change").
    float hue  = fract(cells * 1.2 + time * 0.012 + audioPhase * 0.03
                       + 0.15 * audioValence);
    vec3  tint = imgPalette(hue) * 1.35;

    vec3 col = pic * (0.6 + 0.7 * cells);
    col = mix(col, col * tint * 1.8, 0.55);            // stain the picture
    col *= mix(0.55, 1.05, vein);                      // gentle vein shading
    col *= 1.0 - 0.2 * audioCentroid * (1.0 - vein);   // bright timbre crisps veins
    col *= 1.35;                                       // overall exposure lift
    col += tint * 0.05;                                // faint glow so cells never go black
    col += (audioBeat * 0.20 + audioOnset * 0.30) * col;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
