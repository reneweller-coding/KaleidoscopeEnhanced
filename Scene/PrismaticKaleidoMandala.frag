#version 330 core
out vec4 fragColor;
// PrismaticKaleidoMandala.frag
// -----------------------------------------------------------------------
// PRISMATIC KALEIDO MANDALA: Non-Euclidean Poincaré disk hyperbolic kaleidoscope
// with sacred geometry rosettes, infinite crystalline mirror reflections,
// prismatic chromatic dispersion, and golden-ratio harmonic unfolding.
//   audioPhase   -> rotates interlocking reflection symmetry axes
//   audioSwell   -> unfolds deeper geometric rosette harmonics
//   audioKick    -> triggers radiant jewel bursts and mirror bloom
//   audioCentroid-> shifts crystalline refraction spectra
//
// Per-activation variety:
//   symmetryP   float kaleidoscope sector count multiplier (0.6..2.0)
//   zoomP       float hyperbolic zoom / depth scale        (0.5..1.8)
//   facetP      float faceted crystal bevel intensity      (0.5..2.2)
//   hueP        float chromatic palette rotation           (0..6.28)
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

uniform float symmetryP;
uniform float zoomP;
uniform float facetP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
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

void main() {
    float sym = (symmetryP > 0.0) ? symmetryP : 1.0;
    float zm  = (zoomP     > 0.0) ? zoomP     : 1.0;
    float fct = (facetP    > 0.0) ? facetP    : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.2 + audioAdvance * 0.1;

    // Multi-scale kaleidoscope folding
    float sectors = floor(6.0 * sym + 0.5) * 2.0; // Even sector count for clean mirror
    vec2 p = uv * (1.8 / zm) * (1.0 - 0.15 * sin(t * 0.5) - audioSwell * 0.2);

    // Continuous rotation
    mat2 rot1 = mat2(cos(t * 0.3), -sin(t * 0.3), sin(t * 0.3), cos(t * 0.3));
    p = rot1 * p;

    // Iterative Sacred Geometry Folding
    float accumBevel = 0.0;
    vec3 crystalCol = vec3(0.0);

    for (int i = 0; i < 5; i++) {
        p = kaleidoFold(p, sectors);
        p = poincareFold(p, 1.2);

        // Translational mirror offset
        p -= vec2(0.35 + 0.1 * sin(t + float(i)), 0.2 * cos(t * 0.8 + float(i)));
        
        // Secondary rotation per iteration
        float aIter = t * 0.4 + float(i) * 0.628 + audioPhase * 0.5;
        mat2 rIter = mat2(cos(aIter), -sin(aIter), sin(aIter), cos(aIter));
        p = rIter * p;

        // Faceted crystal bevel lines
        float bevel = abs(p.x) * abs(p.y);
        accumBevel += smoothstep(0.06, 0.0, bevel);

        // Chromatic dispersion per harmonic layer
        float layerPhase = float(i) * 1.256 + t * 0.5 + audioCentroid;
        vec3 layerC = mix(
            vec3(1.0, 0.1, 0.5),
            vec3(0.0, 0.8, 1.0),
            sin(layerPhase) * 0.5 + 0.5
        );
        layerC = mix(layerC, vec3(1.0, 0.8, 0.1), cos(layerPhase * 1.5) * 0.5 + 0.5);

        crystalCol += layerC * exp(-length(p) * 2.0);
    }

    // Facet lines glow
    float facetGlow = (accumBevel * 0.25) * fct * (0.8 + audioKick * 1.2);

    // Sample active photo through kaleidoscope symmetry
    vec2 photoUV = p * 0.5 + vec2(0.5);
    vec3 photo = img(clamp(photoUV, 0.0, 1.0));

    // Combine sacred mandala
    vec3 col = crystalCol * 0.6 + photo * 0.8 + facetGlow * vec3(1.0, 0.9, 0.7);

    // Jewel burst pulse on heavy kick
    if (audioKick > 0.6) {
        float burstR = length(uv);
        float star = sin(atan(uv.y, uv.x) * sectors + time * 4.0);
        float jewel = exp(-burstR * 3.0) * (0.7 + 0.3 * star) * audioKick * 2.0;
        col += vec3(1.0, 0.85, 0.95) * jewel;
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    vec2 vUV = st * (1.0 - st.yx);
    float vig = vUV.x * vUV.y * 15.0;
    col *= clamp(pow(vig, 0.22), 0.0, 1.0);

    fragColor = vec4(col, 1.0);
}
