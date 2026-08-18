#version 330 core
out vec4 fragColor;
/**
 * @file MantleConvectionPlume.frag
 * @brief MANTLE CONVECTION PLUME: Deep Earth core-mantle boundary (D'' layer)
 * thermal plumes rising through Rayleigh-Bénard viscous convection cells.
 * Mushrooming basaltic magma diapir heads, subducting tectonic slabs,
 * 3000°C thermal upwelling, and molten rock photo texture distortion.
 *   audioAdvance -> drives viscous mantle convection vorticity flow
 *   audioKick    -> triggers explosive magma diapir eruptions at the lithosphere
 *   audioBass    -> undulates thermal plume stem thickness & buoyancy
 *   audioCentroid-> shifts magma temperature (deep basaltic red to incandescent gold)
 *
 * Per-activation variety:
 *   plumeP   float mantle thermal plume buoyancy & height  (0.5..2.2)
 *   convectP float Rayleigh-Bénard convection cell density  (0.5..2.0)
 *   speedP   float viscous mantle flow velocity            (0.5..2.0)
 *   hueP     float thermal radiation hue offset            (0..6.28)
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

uniform float plumeP;
uniform float convectP;
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
    float plm = (plumeP   > 0.0) ? plumeP   : 1.0;
    float cnv = (convectP > 0.0) ? convectP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Upwelling convection coordinates (bottom core-mantle boundary y = -0.5 to top lithosphere y = 0.5)
    vec2 p = uv * vec2(4.0 * cnv, 3.0);

    // Rayleigh-Bénard convection vorticity rolls: psi(x, y) = sin(k_x * x) * sin(k_y * y)
    float rollX = sin(p.x + sin(p.y * 2.0 + t) * 0.6);
    float rollY = cos(p.y - t * 2.0) * (0.8 + 0.3 * audioBass);
    float convectionStream = rollX * rollY;

    // Rising thermal plume stem (central upwelling column)
    float stemX = uv.x - sin(uv.y * 4.0 - t * 3.0) * 0.15;
    float stemWidth = (0.12 + 0.08 * (uv.y + 0.5)) * plm;
    float plumeStem = exp(-abs(stemX) * 20.0 / stemWidth);

    // Mushrooming diapir head near the lithosphere (uv.y ~ 0.3)
    float headDist = length(vec2(stemX * 1.5, uv.y - 0.3));
    float diapirHead = exp(-headDist * 6.0) * (1.0 + audioKick * 2.5);

    // Photo texture mapping into molten magma flow
    vec2 magmaWarp = st + vec2(rollX, rollY) * 0.04 * (1.0 + audioKick * 0.7);
    vec3 photo = img(fract(magmaWarp));

    // Viscous magma temperature palette (deep basalt black, glowing 1500°C crimson, molten gold)
    vec3 basaltDark = vec3(0.08, 0.03, 0.02);
    vec3 magmaCrimson = vec3(0.9, 0.2, 0.05);
    vec3 moltenGold   = vec3(1.0, 0.85, 0.3);

    float tempField = clamp(plumeStem * 0.8 + diapirHead * 1.2 + convectionStream * 0.4, 0.0, 1.0);
    vec3 thermalCol = mix(basaltDark, magmaCrimson, tempField);
    thermalCol = mix(thermalCol, moltenGold, pow(tempField, 2.5) * (1.0 + audioSwell * 0.8));

    // Combine visualizer
    vec3 col = mix(photo * 0.7, thermalCol, 0.6 + 0.2 * audioLevel);
    col += diapirHead * vec3(1.0, 0.95, 0.7) * (1.0 + audioKick * 2.0);

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
