#version 330 core
out vec4 fragColor;
// AuroraAustralisCurtainSwell.frag
// -----------------------------------------------------------------------
// AURORA AUSTRALIS CURTAIN SWELL: Volumetric double-sheet Antarctic Aurora
// Australis waving along geomagnetic field lines. Atomic oxygen green emission
// (557.7nm) and high-altitude molecular nitrogen crimson rays (630.0nm),
// magnetic substorm surges, and polar ice pack photo reflections.
//   audioAdvance -> drives geomagnetic auroral curtain wave undulations
//   audioKick    -> triggers explosive geomagnetic substorm brightening
//   audioBass    -> undulates auroral curtain vertical height & bottom fold
//   audioCentroid-> shifts balance between oxygen green and nitrogen red
//
// Per-activation variety:
//   curtainP float auroral curtain folding & sheet count (0.5..2.2)
//   rayP     float vertical ray filament sharpness       (0.5..2.0)
//   speedP   float auroral drift velocity                (0.5..2.0)
//   hueP     float atmospheric ion emission hue offset   (0..6.28)
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

uniform float curtainP;
uniform float rayP;
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

void main() {
    float crt = (curtainP > 0.0) ? curtainP : 1.0;
    float ray = (rayP     > 0.0) ? rayP     : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Dual auroral curtain sheets waving horizontally across the sky
    float wave1 = sin(uv.x * 3.5 * crt + t * 2.0) * 0.18 + sin(uv.x * 7.0 - t * 3.0) * 0.08;
    float wave2 = cos(uv.x * 4.0 * crt - t * 2.5) * 0.18 + cos(uv.x * 8.0 + t * 2.0) * 0.08;

    // Distance to lower curtain boundary (bottom fold)
    float baseAltitude = -0.15 + 0.1 * audioBass;
    float dist1 = uv.y - (baseAltitude + wave1);
    float dist2 = uv.y - (baseAltitude + wave2 + 0.15);

    // Vertical ray filaments along geomagnetic field lines
    float rayFilaments1 = pow(abs(sin(uv.x * 30.0 * ray + t * 4.0)), 4.0);
    float rayFilaments2 = pow(abs(sin(uv.x * 25.0 * ray - t * 3.5)), 4.0);

    // Volumetric curtain brightness
    float curtain1 = exp(-max(0.0, dist1) * 3.5) * smoothstep(-0.05, 0.05, dist1) * (1.0 + rayFilaments1 * 0.8);
    float curtain2 = exp(-max(0.0, dist2) * 3.0) * smoothstep(-0.05, 0.05, dist2) * (1.0 + rayFilaments2 * 0.8);

    // Geomagnetic substorm surge on kick
    float substorm = (curtain1 + curtain2) * (audioKick * 3.5 + audioHigh * 1.5);

    // Photo texture mapping into polar ice reflection and sky
    vec2 photoUV = st + vec2(wave1, wave2) * 0.04 * (1.0 + audioKick * 0.6);
    vec3 photo = img(fract(photoUV));

    // Ion emission colors: Oxygen 557.7nm Emerald (lower altitude), Nitrogen 630.0nm Crimson (high altitude)
    vec3 oxygenGreen = vec3(0.05, 0.98, 0.45);
    vec3 nitrogenRed = vec3(0.95, 0.15, 0.4);
    vec3 ionViolet   = vec3(0.5, 0.2, 0.95);

    float altFactor = clamp((uv.y - baseAltitude) * 1.5, 0.0, 1.0);
    vec3 auroraCol1 = mix(oxygenGreen, nitrogenRed, altFactor);
    vec3 auroraCol2 = mix(oxygenGreen, ionViolet, altFactor);

    vec3 auroraTotal = curtain1 * auroraCol1 + curtain2 * auroraCol2;

    // Combine visualizer with starry polar sky
    vec3 nightSky = vec3(0.02, 0.03, 0.08);
    vec3 col = mix(nightSky, photo * 0.8, 0.35 + 0.2 * audioLevel);
    col += auroraTotal * (1.2 + audioSwell * 0.8);
    col += substorm * vec3(1.0, 0.98, 0.9) * 1.5;

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, length(uv));
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.6;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
