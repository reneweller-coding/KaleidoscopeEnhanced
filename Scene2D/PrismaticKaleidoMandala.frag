#version 330 core
out vec4 fragColor;
/**
 * @file PrismaticKaleidoMandala.frag
 * @brief PRISMATIC KALEIDO MANDALA: Non-Euclidean Poincaré disk hyperbolic kaleidoscope
 * with sacred geometry rosettes, infinite crystalline mirror reflections,
 * prismatic chromatic dispersion, and golden-ratio harmonic unfolding.
 *   audioPhase   -> rotates interlocking reflection symmetry axes
 *   audioSwell   -> unfolds deeper geometric rosette harmonics
 *   audioKick    -> triggers radiant jewel bursts and mirror bloom
 *   audioCentroid-> shifts crystalline refraction spectra
 *
 * Per-activation variety:
 *   symmetryP   float kaleidoscope sector count multiplier (0.6..2.0)
 *   zoomP       float hyperbolic zoom / depth scale        (0.5..1.8)
 *   facetP      float faceted crystal bevel intensity      (0.5..2.2)
 *   hueP        float chromatic palette rotation           (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float symmetryP;
uniform float zoomP;
uniform float facetP;
uniform float hueP;
uniform float audioChromaHue;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


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

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Hyperbolic Poincaré disk inversion
vec2 poincareFold(vec2 z, float rMax) {
    float d2 = dot(z, z);
    if (d2 > rMax * rMax) {
        z = z * (rMax * rMax / max(d2, 1e-5));
    }
    return z;
}

// Kaleidoscope reflection fold
vec2 kaleidoFold(vec2 p, float sectors) {
    float a = atan(p.y, p.x);
    float r = length(p);
    float sectorAngle = 6.2831853 / sectors;
    a = mod(a, sectorAngle);
    a = abs(a - sectorAngle * 0.5);
    return vec2(cos(a), sin(a)) * r;
}

// USER-FEEDBACK-REDESIGN: an actual sacral photo kaleidoscope.  The old
// version stacked five additive crystal-fog layers that clipped to white —
// now ONE clean angular mirror fold carries the picture, mandala rings
// breathe over it, and thin bevel lines spark on the wedge seams.
void main() {
    float sym = (symmetryP > 0.0) ? symmetryP : 1.0;
    float zm  = (zoomP     > 0.0) ? zoomP     : 1.0;
    float fct = (facetP    > 0.0) ? facetP    : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float t = time * 0.2 + audioAdvance * 0.12;
    uv = mat2(cos(t * 0.3), -sin(t * 0.3), sin(t * 0.3), cos(t * 0.3)) * uv;

    // Classic kaleidoscope: fold the ANGLE into one mirrored wedge.
    float sectors = floor(5.0 * sym + 0.5) * 2.0;      // even = clean mirrors
    float r   = length(uv);
    float ang = atan(uv.y, uv.x);
    float sec = 6.2831853 / sectors;
    ang = abs(mod(ang, sec) - sec * 0.5);
    vec2 kp = vec2(cos(ang), sin(ang)) * r;

    // The photo lives in the wedge; slow drift keeps fresh image regions
    // flowing in, swell breathes the zoom.
    vec2 puv = kp * (0.55 / zm) * (1.0 - 0.10 * sin(t * 0.5) - 0.12 * audioSwell)
             + vec2(0.5) + 0.07 * vec2(sin(t * 0.37), cos(t * 0.29));
    vec3 mand = img(fract(puv));

    // Mandala rings + petal modulation.
    float petals = cos(ang * sectors * 0.5) * 0.5 + 0.5;
    float rings  = 0.5 + 0.5 * cos(r * (9.0 * fct) - t * 2.0 - audioPhase);
    float band   = smoothstep(0.35, 0.9, rings) * (0.45 + 0.55 * petals);

    vec3 lit = imgPalette(r * 0.5 + hue * 0.1) * 1.4;

    // Bevel sparks exactly on the mirror seams.
    float seams = exp(-ang * 55.0 * (0.3 + r))
                + exp(-abs(ang - sec * 0.5) * 55.0 * (0.3 + r));

    vec3 col = mand * (0.75 + 0.75 * band)
             + lit * band * 0.40
             + (lit * 0.6 + vec3(0.45)) * seams * (0.45 + 0.5 * audioFlux)
             + lit * exp(-r * 4.5) * (0.25 + 0.45 * audioKick);   // glowing heart

    col *= 0.85 + 0.5 * audioLevel;
    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));   // soft knee
    fragColor = vec4(col, 1.0);
}
