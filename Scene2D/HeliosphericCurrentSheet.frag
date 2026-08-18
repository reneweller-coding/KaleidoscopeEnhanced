#version 330 core
out vec4 fragColor;
/**
 * @file HeliosphericCurrentSheet.frag
 * @brief HELIOSPHERIC CURRENT SHEET: Rotating Parker spiral "ballerina skirt"
 * current sheet separating opposite magnetic polarities throughout the solar
 * system. Wavy sector boundary crossings, solar wind stream turbulence,
 * and undulating plasma membrane photo reflections.
 *   audioAdvance -> rotates Parker spiral sector boundaries & solar wind
 *   audioKick    -> flashes interplanetary magnetic reconnection sheets
 *   audioBass    -> undulates ballerina skirt wave amplitude & tilt
 *   audioCentroid-> shifts solar wind proton/electron temperature grading
 *
 * Per-activation variety:
 *   spiralP float Parker spiral arm winding tightness   (0.5..2.2)
 *   skirtP  float ballerina skirt vertical waviness     (0.5..2.0)
 *   speedP  float solar rotation velocity                (0.5..2.0)
 *   hueP    float interplanetary magnetic hue offset     (0..6.28)
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

uniform float spiralP;
uniform float skirtP;
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

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float spr = (spiralP > 0.0) ? spiralP : 1.0;
    float skr = (skirtP  > 0.0) ? skirtP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Archimedian / Parker spiral: r(theta) = v / omega * theta
    // Spiral phase: angle - r * winding - t
    float spiralArm = angle - r * 8.0 * spr - t * 2.5;

    // Ballerina skirt wavy undulation: z(r, theta) = r * sin(4 * spiralArm)
    float skirtWave = sin(spiralArm * 2.0) * (0.45 * skr + 0.2 * audioBass);

    // Sector boundary current sheet (where magnetic polarity flips B_r = 0)
    float sheetDist = abs(skirtWave);
    float currentSheet = exp(-sheetDist * 16.0);

    // Solar wind radial stream turbulence
    float turbulence = sin(r * 40.0 - t * 10.0 + angle * 6.0) * 0.08 * (1.0 + audioHigh);

    // Photo texture mapping along spiral current sheet
    vec2 photoUV = st + vec2(sin(spiralArm), cos(spiralArm)) * 0.04 * (1.0 + audioKick * 0.7);
    vec3 photo = img(fract(photoUV));

    // Magnetic polarity palette: North Sector (Cyan/Blue), South Sector (Amber/Red), Current Sheet (Gold/White)
    vec3 northSector = vec3(0.05, 0.4, 0.9);
    vec3 southSector = vec3(0.9, 0.3, 0.1);
    vec3 sheetGold   = vec3(1.0, 0.95, 0.5);

    float polarity = smoothstep(-0.2, 0.2, skirtWave);
    vec3 sectorColor = mix(northSector, southSector, polarity);

    // Magnetic reconnection flash on kick
    float reconnection = currentSheet * (audioKick * 3.5 + audioSubBass * 1.2);

    // Combine visualizer
    vec3 col = mix(sectorColor * 0.4, photo * 0.9, 0.5 + 0.2 * audioLevel);
    col += currentSheet * sheetGold * (1.2 + audioSwell * 0.8);
    col += reconnection * vec3(1.0, 0.98, 0.85) * 1.5;
    col += turbulence * vec3(0.3, 0.8, 1.0);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, r);
    col *= vig;

    fragColor = vec4(col, 1.0);
}
