#version 330 core
out vec4 fragColor;
/**
 * @file HyperbolicKaleidoscope.frag
 * @brief HYPERBOLIC KALEIDOSCOPE: a kaleidoscope folded in the Poincare
 * disc.  A flat kaleidoscope has p mirrors meeting at one point; this one
 * reflects across the edges of a regular {p,q} polygon of the hyperbolic
 * plane, so infinitely many chambers crowd toward the rim, each a smaller
 * copy of the last.  The camera drives toward the rim forever: a hyperbolic
 * translation by exactly one polygon step is a symmetry of the tiling, so
 * the drive is periodic and the wrap invisible.  Outside the disc the
 * picture is the disc inverted in its own rim, so the screen is full.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the drive toward the rim (music-paced, periodic)
 *   audioSwell   -> the disc breathes on builds (slow)
 *   audioKick    -> the mirror seams flash
 *   audioSwell   -> chamber brightness
 *   audioMelodyPitch -> hue of the chamber generations
 *
 * Per-activation variety: sidesP (p = 4, 6 or 8), qP (q within the
 * hyperbolic range), speedP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioMelodyPitch;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sidesP;
uniform float qP;
uniform float speedP;
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

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-9); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    // {p,q}: p in {4,6,8} so that a one-polygon translation along an edge
    // spoke is a mirror symmetry of the tiling (the wrap is invisible);
    // q chosen inside the hyperbolic range (p-2)(q-2) > 4.
    float pp = 4.0 + 2.0 * floor(clamp(sidesP, 0.0, 2.99));
    float qmin = (pp < 5.0) ? 5.0 : ((pp < 7.0) ? 4.0 : 3.0);
    float qq = qmin + floor(clamp(qP, 0.0, 0.99) * 2.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;

    // Polygon: distance from centre to edge midpoint r_e, its Euclidean
    // radius u in the disc, and the edge geodesic as a circle (cx, R).
    float re = acosh(cos(3.14159265 / qq) / sin(3.14159265 / pp));
    float u  = tanh(re * 0.5);
    float cx = (1.0 + u * u) / (2.0 * u);
    float R  = (1.0 - u * u) / (2.0 * u);

    // The disc breathes with the bass; outside it, invert in the rim.
    float discR = 0.56 * (1.0 + 0.05 * clamp(audioSwell, 0.0, 1.0));   // slow breath only (V7d)
    vec2 z = p / discR;
    float rimD = abs(length(z) - 1.0);
    if (dot(z, z) > 1.0) z = z / dot(z, z);

    // Slow turn, then the drive: translation along x by t, periodic in the
    // polygon step 2*r_e.
    float rot = sceneAdvance * 0.05;
    z = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * z;
    float L = 2.0 * re;
    float t = mod(sceneAdvance * 0.28 * (speedP > 0.05 ? speedP : 1.0) + sceneTime * 0.05, L);
    float ch = cosh(t * 0.5), sh = sinh(t * 0.5);
    z = cdiv(z * ch + vec2(sh, 0.0), cmul(z, vec2(sh, 0.0)) + vec2(ch, 0.0));

    // Fold into the fundamental domain: mirror the p-fold sector, then
    // invert across the edge circle while the point lies beyond it.
    float sector = 6.2831853 / pp;
    float inv = 0.0;
    float seam = 1e9;
    for (int i = 0; i < 18; ++i)
    {
        float a = atan(z.y, z.x);
        a = mod(a, sector);
        a = abs(a - sector * 0.5);
        seam = min(seam, abs(a - sector * 0.5) * length(z));
        z = length(z) * vec2(cos(a), sin(a));
        vec2 d = z - vec2(cx, 0.0);
        float dd = dot(d, d);
        seam = min(seam, abs(sqrt(dd) - R));
        if (dd < R * R)
        {
            z = vec2(cx, 0.0) + d * (R * R / max(dd, 1e-9));
            inv += 1.0;
        }
        else break;
    }

    // Colour: the photo lives in the fundamental domain (endless copies of
    // it); the chamber generation shifts the palette, parity flips the tint.
    vec2 uv = fract(z * vec2(1.6, 2.4) + vec2(0.1, 0.5) + sceneAdvance * 0.01);
    vec3 tex = img(uv);
    float par = mod(inv, 2.0);
    vec3 tint = imgPalette(hue * 0.159 + 0.08 * inv + 0.3 * audioMelodyPitch + 0.5 * par);
    vec3 col = mix(tex, tex * tint * 2.2, 0.7);
    // Contrast: square, and darken every other chamber so the tiling reads.
    col = col * col * 2.6 * (0.6 + 0.6 * audioLevel) * (0.55 + 0.45 * par);

    // Seams: the mirror lines of the tiling, flashing on the kick.
    float seamL = exp(-seam * (45.0 - 20.0 * audioKick)) * (0.7 + 0.9 * audioKick);
    col += imgPalette(hue * 0.159 + 0.9) * seamL;
    // The rim of the disc: a bright ring where the two infinities meet.
    col += imgPalette(hue * 0.159 + 0.6) * exp(-rimD * 30.0) * 0.6;
    col *= 0.85 + 0.4 * audioSwell;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
