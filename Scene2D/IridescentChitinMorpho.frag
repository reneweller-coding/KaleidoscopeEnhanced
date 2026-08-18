#version 330 core
out vec4 fragColor;
// IridescentChitinMorpho.frag
// -----------------------------------------------------------------------
// IRIDESCENT CHITIN MORPHO: 100% viewport-filling bio-photonic dielectric
// nanostructure grating simulation (Morpho butterfly wings & jewel beetle
// iridescent chitin). Multi-layer Bragg interference producing pure
// structural color shifting from peacock cyan to electric cobalt and violet.
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

uniform float gratingP;
uniform float scaleP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Multi-layer Bragg dielectric reflection color
vec3 braggStructuralColor(float cosIncidence, float gratingSpacing) {
    // 2 * d * cos(theta) = m * lambda
    float optPath = 2.0 * gratingSpacing * cosIncidence;
    
    // Constructive interference for RGB wavelengths
    float r = pow(max(cos(optPath * 14.0 - 0.5), 0.0), 4.0);
    float g = pow(max(cos(optPath * 16.5 - 1.2), 0.0), 4.0);
    float b = pow(max(cos(optPath * 19.0 - 2.0), 0.0), 4.0);

    // Morpho peacock iridescent base
    vec3 peacockCyan = vec3(0.0, 0.85, 1.0);
    vec3 cobaltBlue  = vec3(0.1, 0.35, 0.95);
    vec3 deepViolet  = vec3(0.6, 0.10, 0.90);

    vec3 col = mix(peacockCyan, cobaltBlue, smoothstep(0.4, 0.8, cosIncidence));
    col = mix(col, deepViolet, smoothstep(0.8, 1.0, cosIncidence));
    col += vec3(r, g, b) * 1.5;

    return col;
}

void main() {
    float grt = (gratingP > 0.0) ? gratingP : 1.0;
    float scl = (scaleP   > 0.0) ? scaleP   : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Microscopic scale-tile pattern (overlapping butterfly scales)
    vec2 scaleCoord = uv * 8.0 * scl;
    vec2 cell = floor(scaleCoord);
    vec2 f = fract(scaleCoord) - vec2(0.5);

    // Scale ribbing nanostructure lines
    float ribLines = sin(f.x * 40.0 * grt + sin(f.y * 20.0 + t) * 2.0);
    float ribbing = smoothstep(-0.2, 0.8, ribLines);

    // Viewing angle incidence calculation
    float r = length(uv);
    float angle = atan(uv.y, uv.x);
    float cosTheta = clamp(1.0 - r * 0.6 + 0.3 * sin(angle * 4.0 + t), 0.1, 1.0);

    // Dynamic grating spacing modulated by audio
    float gratingD = (1.0 + 0.2 * audioBass + 0.15 * ribbing);
    vec3 structColor = braggStructuralColor(cosTheta, gratingD);

    // Photo texture projection decomposed through photonic crystal
    vec2 photoUV = uv * 0.5 + vec2(0.5) + vec2(cos(t * 0.2), sin(t * 0.3)) * 0.1;
    vec3 photoBase = img(fract(photoUV));

    // Metallic chitin specular sheen
    float specSheen = pow(max(cosTheta, 0.0), 16.0) * (0.8 + 1.2 * audioHigh);

    // Flash wave across scales on beat kick
    float flashWave = exp(-abs(r - fract(time * 0.7) * 1.5) * 6.0) * audioKick * 2.5;

    vec3 col = (structColor * 1.8 + photoBase * 0.6) * (0.7 + 0.3 * ribbing);
    col += vec3(1.0) * specSheen * 1.2 + structColor * flashWave;

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9)); // Saturation boost
    col += vec3(0.02, 0.05, 0.08) * audioSwell;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.5;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
