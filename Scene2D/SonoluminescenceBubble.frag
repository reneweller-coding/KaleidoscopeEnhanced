#version 330 core
out vec4 fragColor;
/**
 * @file SonoluminescenceBubble.frag
 * @brief SONOLUMINESCENCE BUBBLE: Acoustic cavitation bubble collapse in an
 * ultrasonic standing wave field. Adiabatic gas compression generates a
 * picosecond-duration 20,000K plasma flash with spherical acoustic shockwaves,
 * water refraction caustics, and liquid photo distortion.
 *   audioAdvance -> cycles ultrasonic acoustic compression phases
 *   audioKick    -> triggers maximum adiabatic bubble collapse & plasma flash
 *   audioBass    -> drives ultrasonic standing wave amplitude
 *   audioCentroid-> shifts plasma blackbody emission temperature
 *
 * Per-activation variety:
 *   cavityP float cavitation bubble scale & radius       (0.5..2.2)
 *   shockP  float acoustic shockwave ring intensity      (0.5..2.0)
 *   speedP  float ultrasonic frequency velocity          (0.5..2.0)
 *   hueP    float plasma spectrum chromatic hue offset   (0..6.28)
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
uniform float audioChromaHue;

uniform float cavityP;
uniform float shockP;
uniform float speedP;
uniform float hueP;

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

void main() {
    float cav = (cavityP > 0.0) ? cavityP : 1.0;
    float shk = (shockP  > 0.0) ? shockP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Ultrasonic standing wave cycle: expansion -> violent collapse -> rebound
    float cycle = fract(t * 1.5 + audioPhase * 0.5);
    float bubbleR = (0.28 * sin(cycle * 3.14159) + 0.05) * cav * (1.0 + 0.3 * audioBass);

    // Instant of maximum collapse and picosecond flash
    float flashInstant = exp(-pow(cycle - 0.95, 2.0) * 120.0) * (audioKick * 4.0 + 0.8);

    // Spherical acoustic shockwaves radiating outwards
    float shockwave1 = sin(r * 32.0 - t * 14.0) * exp(-r * 2.5);
    float shockwave2 = cos(r * 50.0 - t * 20.0) * exp(-r * 3.5);
    float acousticRings = max(0.0, shockwave1 + shockwave2 * 0.6) * shk;

    // Liquid water refraction caustics
    vec2 causticCoord = uv * 8.0 + vec2(sin(t * 2.0 + r * 10.0), cos(t * 2.0 - r * 10.0)) * 0.2;
    float caustic = pow(sin(causticCoord.x + sin(causticCoord.y * 1.5)) * 0.5 + 0.5, 3.0);

    // Liquid photo distortion
    vec2 photoWarp = st + (uv / (r + 0.1)) * (shockwave1 * 0.04 + flashInstant * 0.06);
    vec3 photo = img(clamp(photoWarp, 0.0, 1.0));

    // Bubble interface Fresnel reflection
    float bubbleDist = abs(r - bubbleR);
    float bubbleWall = exp(-bubbleDist * 40.0 / cav);

    // Plasma core flash color (ultraviolet white / cyan / violet)
    vec3 plasmaColor = mix(imgPalette(0.15) * 1.5, vec3(1.0, 0.95, 0.9), flashInstant * 0.5);

    // Combine visualizer
    vec3 col = photo * (0.8 + 0.3 * audioLevel);
    col += bubbleWall * vec3(0.4, 0.9, 1.0) * (1.0 + audioMid);
    col += acousticRings * vec3(0.3, 0.7, 1.0) * (1.2 + audioKick * 2.0);
    col += caustic * vec3(0.2, 0.5, 0.8) * 0.6;
    col += exp(-r * 25.0) * plasmaColor * flashInstant * 3.5;

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.3, 0.3, r);
    col *= vig;

    fragColor = vec4(col, 1.0);
}
