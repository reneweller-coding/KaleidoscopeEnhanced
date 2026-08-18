#version 330 core
out vec4 fragColor;
// NonEuclideanHyperbolicMandala.frag
// -----------------------------------------------------------------------
// NON-EUCLIDEAN HYPERBOLIC MANDALA: 100% viewport-filling infinite
// hyperbolic space tessellation on the Poincare disk with {7,3} sacred
// geometry Coxeter circle inversions, logarithmic spirals, deep fractal
// zoom, and recursive kaleidoscopic photo texture folding.
// -----------------------------------------------------------------------

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
uniform float audioChromaHue;

uniform float symmP;
uniform float zoomP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard, replaces the generic cos-rainbow): colours
// come from a rotating arc in the CURRENT slideshow image, so every
// activation inherits a fresh palette from the photos, and the arc follows
// the musical key (chromaHue is circular-slewed = jump-free) with a slow
// advance drift.  Valence shapes saturation toward the mood.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}


vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Hyperbolic Mobius translation (isometry of Poincare disk)
vec2 mobius(vec2 z, vec2 a) {
    vec2 num = z + a;
    vec2 den = vec2(1.0 + z.x * a.x + z.y * a.y, z.y * a.x - z.x * a.y);
    return vec2(
        num.x * den.x + num.y * den.y,
        num.y * den.x - num.x * den.y
    ) / dot(den, den);
}

void main() {
    float sym = (symmP > 0.0) ? symmP : 7.0; // 7-fold hyperbolic symmetry
    float zm  = (zoomP > 0.0) ? zoomP : 1.0;
    float spd = (speedP> 0.0) ? speedP: 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Hyperbolic space zoom & translation
    float t = time * 0.25 * spd + audioAdvance * 0.15;
    vec2 z = uv * (1.6 / zm) * (1.0 - 0.2 * audioBass);

    // Hyperbolic isometry translation vector
    vec2 a = vec2(sin(t * 0.6), cos(t * 0.4)) * 0.45 * (1.0 + 0.3 * audioKick);
    z = mobius(z, a);

    // Poincare disk inversion folding (Coxeter group circle inversions)
    float sectorAngle = 6.2831853 / sym;
    float totalInversions = 0.0;
    float minD = 1000.0;

    for (int i = 0; i < 6; ++i) {
        // N-fold rotational symmetry fold
        float ang = atan(z.y, z.x);
        ang = mod(ang + 0.5 * sectorAngle, sectorAngle) - 0.5 * sectorAngle;
        float r = length(z);
        z = vec2(cos(ang), sin(ang)) * r;

        // Hyperbolic circle inversion: reflection across circle centered at (c_x, 0) with radius r_c
        float c_x = 1.35;
        float r_c = 0.85;
        vec2 d = z - vec2(c_x, 0.0);
        float d2 = dot(d, d);

        if (d2 < r_c * r_c) {
            z = vec2(c_x, 0.0) + d * (r_c * r_c / d2);
            totalInversions += 1.0;
        }

        minD = min(minD, abs(length(z) - 0.5));
    }

    // Kaleidoscope mandala photo texture coordinate
    vec2 mandalaUV = z * 0.5 + vec2(0.5);
    mandalaUV = fract(mandalaUV + vec2(time * 0.05, audioPhase * 0.1));

    vec3 photoCol = img(mandalaUV);

    // Sacred geometry gold and iridescent borders
    float border = exp(-abs(minD) * 30.0);
    float innerRings = sin(length(z) * 25.0 - time * 4.0);
    float ringGlow = exp(-abs(innerRings) * 6.0) * (0.8 + 1.2 * audioHigh);

    vec3 gold = vec3(1.0, 0.82, 0.35);
    vec3 iridescent = imgPalette((totalInversions * 1.2 + audioPhase) * 0.159);

    vec3 col = photoCol * (0.8 + 0.4 * totalInversions) + gold * border * 2.5 + iridescent * ringGlow * 1.5;
    col += vec3(1.0) * audioKick * exp(-length(uv) * 4.0) * 1.5; // Central burst

    col = hueRot(col, hue);   // chromaHue handled inside imgPalette
    col = pow(col, vec3(0.88));

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
