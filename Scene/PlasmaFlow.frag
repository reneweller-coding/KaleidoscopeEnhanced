#version 330 core
out vec4 fragColor;
// PlasmaFlow.frag
// -----------------------------------------------------------------------
// The source image MARBLED and refracted by a flowing plasma field, folded
// into mirror symmetry so it reads like liquid stained glass.  The plasma is
// no longer the picture (it used to be a full-screen sine field with the image
// as a 40% tint) - instead the plasma is a FLOW that warps the actual picture,
// and its iridescence tints the folded image.  So the *image* is the star.
//   sidesP/scaleP/flowAmtP -> per-activation character (fold, scale, marbling)
//   audioSwell   -> plasma scale + warp breathing (slow; loudness -> size)
//   audioValence -> iridescence saturation; audioCentroid -> slow hue drift
//   audioPhase   -> smooth flow (jump-free); audioBarPhase -> per-bar hue sweep
//   audioBeat    -> sheen; audioLevel -> picture brightness
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioPhase;
uniform float audioSwell;      // slow loudness swell -> plasma scale/warp breathe
uniform float audioBarPhase;   // 0..1 per bar -> gentle per-bar hue sweep

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   sidesP;          // mirror fold count (0 -> 4; 2..8)
uniform float scaleP;          // plasma scale      (0 -> 6.0; 3.5 = broad, 8 = busy)
uniform float flowAmtP;        // marbling strength (0 -> 0.10; 0.06..0.16)
uniform float audioChromaHue;
uniform float audioAdvance;

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

vec3 hsv2rgb(vec3 c)
{
    vec3 p = imgPalette(c.x) * 1.35;   // photo-arc palette (house standard)
    return c.z * mix(vec3(1.0), p, c.y);
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
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    p = rot(audioPhase * 0.2 + time * 0.02) * p;

    // Mirror symmetry: FIXED per activation.  (The old floor(valence) fold
    // snapped the whole frame; the old arousal-driven scale rescaled the
    // entire sine field every frame -> the "Gezappel".)
    vec2  fp = kaleido(p, float((sidesP >= 2) ? sidesP : 4));

    float t     = time * 0.2 + audioPhase * 0.5;
    // Plasma scale is constant per activation and breathes only with the
    // SLOW swell (loudness -> size).
    float scale = ((scaleP <= 0.01) ? 6.0 : scaleP) * (1.0 + 0.06 * audioSwell);
    vec2  q     = fp * scale;

    // Plasma value.
    float v = sin(q.x + t);
    v += sin(q.y * 1.3 + t * 1.1);
    v += sin((q.x + q.y) * 0.7 + t * 0.8);
    float cx = q.x + 2.0 * sin(t * 0.3);
    float cy = q.y + 2.0 * cos(t * 0.4);
    v += sin(sqrt(cx * cx + cy * cy) * 1.2 + t * 1.5);
    v *= 0.25;   // ~[-1, 1]

    // Plasma FLOW warps the folded picture (marbling).  The warp amplitude
    // breathes only with the SLOW swell (the old audioLevel term wobbled it).
    vec2 flow = vec2(sin(q.y * 1.3 + t * 1.1), cos(q.x + t));
    float flowAmt = ((flowAmtP <= 0.001) ? 0.10 : flowAmtP)
                  * (0.7 + 0.5 * audioSwell);
    vec2 iuv  = fp * 0.6 + 0.5 + flow * v * flowAmt;
    vec3 pic  = img(fract(iuv));

    // Iridescent plasma sheen tints the picture.  The hue moves only via slow
    // terms (the old audioPitch key jumped with every note) and sweeps gently
    // once per bar (continuous across the bar wrap).
    float hue   = fract(0.5 + 0.5 * v + time * 0.01 + 0.08 * audioCentroid
                        + 0.10 * sin(audioBarPhase * 6.28318));
    vec3  sheen = hsv2rgb(vec3(hue, 0.45 + 0.55 * audioValence, 1.0));

    vec3 col = pic * (0.75 + 0.45 * audioLevel);
    col = mix(col, col * sheen * 1.7, 0.5);           // marble the image
    col += sheen * (0.10 + 0.13 * audioBeat);         // beat sheen
    col *= (1.0 + 0.15 * audioSwell);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
