#version 330 core
out vec4 fragColor;
// ChromaAcidTrip.frag
// -----------------------------------------------------------------------
// CHROMA ACID TRIP: Hypnotic psychedelic feedback vortex with melting contour
// lines, reaction-diffusion spirals, liquid rainbow gradients, optical
// warp displacement, and high-energy audio-driven color state transformations.
//   audioLevel   -> drives feedback displacement velocity & melt intensity
//   audioKick    -> triggers chromatic inversion flash & color ripple shockwaves
//   audioChromaHue-> rotates liquid psychedelic color spectrum
//   audioSwell   -> widens feedback vortex expansion & saturation
//
// Per-activation variety:
//   meltP      float liquid contour melting intensity     (0.5..2.2)
//   feedbackP  float recursive feedback zoom factor       (0.5..1.8)
//   speedP     float psychedelic swirl velocity           (0.5..1.8)
//   hueP       float base hue palette shift               (0..6.28)
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

uniform float meltP;
uniform float feedbackP;
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

// Hypnotic psychedelic acid color map
vec3 acidPalette(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(2.0, 1.0, 0.0);
    vec3 d = vec3(0.5, 0.20, 0.25);
    return a + b * cos(6.28318 * (c * t + d));
}

void main() {
    float mlt = (meltP     > 0.0) ? meltP     : 1.0;
    float fdb = (feedbackP > 0.0) ? feedbackP : 1.0;
    float spd = (speedP    > 0.0) ? speedP    : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.2;

    // Psychedelic polar coordinates
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Multi-arm logarithmic spiral feedback
    float arms = 7.0;
    float spiral = a * arms + log(max(r, 0.01)) * 12.0 * fdb - t * 3.0;

    // Melting sinusoidal wave contours
    vec2 meltCoord = uv * 4.0;
    float wave1 = sin(meltCoord.x + sin(meltCoord.y * 1.5 + t) * 2.0 * mlt);
    float wave2 = cos(meltCoord.y + sin(meltCoord.x * 1.5 - t) * 2.0 * mlt);
    float wave3 = sin((meltCoord.x + meltCoord.y) * 1.2 + spiral * 0.2 + audioBass * 3.0);

    float acidPattern = (wave1 + wave2 + wave3) / 3.0;

    // Psychedelic contour isolines (topographic acid bands)
    float contours = sin(acidPattern * 18.0 + spiral + audioPhase * 4.0);
    float isolines = smoothstep(0.7, 0.95, abs(contours));

    // Vibrant rainbow color assignment
    float colorPhase = acidPattern * 1.5 + r * 0.8 - t * 0.5 + audioChromaHue;
    vec3 acidCol = acidPalette(colorPhase);
    acidCol = mix(acidCol, vec3(1.0) - acidCol, isolines * 0.8);

    // Optical warp distortion for photo sampling
    vec2 photoWarp = st + vec2(wave1, wave2) * 0.04 * mlt * (1.0 + audioKick * 0.8);
    vec3 photo = img(clamp(photoWarp, 0.0, 1.0));

    // Combine psychedelic visualizer
    vec3 col = mix(acidCol, photo * 1.4, 0.4 + 0.3 * audioLevel);
    col += isolines * vec3(1.0, 0.9, 0.2) * (0.8 + audioHigh * 1.2);

    // Audio-reactive chromatic solarization flash on kick
    if (audioKick > 0.65) {
        col = abs(col - vec3(audioKick * 0.8));
    }

    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    vec2 vUV = st * (1.0 - st.yx);
    float vig = vUV.x * vUV.y * 15.0;
    col *= clamp(pow(vig, 0.25), 0.0, 1.0);

    fragColor = vec4(col, 1.0);
}
