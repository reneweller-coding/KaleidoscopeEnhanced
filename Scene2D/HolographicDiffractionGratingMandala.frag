#version 330 core
out vec4 fragColor;
/**
 * @file HolographicDiffractionGratingMandala.frag
 * @brief HOLOGRAPHIC DIFFRACTION GRATING MANDALA: Triple crossed laser interference
 * gratings at 120 degrees creating a hyper-sharp holographic security seal mandala
 * with rainbow diffraction sparkle, micro-etched fractal rings, and laser nodes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous grating phase translation & rainbow rotation
 *   audioKick    -> flashes holographic laser nodes & expands diffraction bandwidth
 *   audioCentroid-> modulates micro-etched grating line frequency
 *   audioSubBass -> expands holographic mandala radius breathing
 *   audioChromaHue-> steers the prismatic holographic foil spectrum
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

// Per-activation variety
uniform float speedP;
uniform float gratingFreqP;
uniform float rainbowP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float gFreq = (gratingFreqP > 0.01) ? gratingFreqP : 1.0;
    // Ganzzahlig gerundet: rBow multipliziert unten den atan-Winkel; jeder
    // nicht-ganzzahlige Faktor reisst am Branch-Cut eine Kante auf.
    float rBow = max(1.0, floor(((rainbowP > 0.01) ? rainbowP : 1.2) + 0.5));
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Rotation of holographic foil
    float rotA = t * 0.15 + audioPhase * 0.1;
    float cs = cos(rotA), sn = sin(rotA);
    vec2 p = mat2(cs, -sn, sn, cs) * uv;

    float k = (28.0 + 12.0 * audioCentroid) * gFreq;

    // 3 Crossed plane waves under 120 degrees
    vec2 k1 = vec2(cos(0.0), sin(0.0)) * k;
    vec2 k2 = vec2(cos(2.094395), sin(2.094395)) * k;
    vec2 k3 = vec2(cos(4.188790), sin(4.188790)) * k;

    float w1 = cos(dot(k1, p) - t * 3.0);
    float w2 = cos(dot(k2, p) - t * 3.0);
    float w3 = cos(dot(k3, p) - t * 3.0);

    // Hexagonal interference intensity: |w1 + w2 + w3|^2
    float interfer = (w1 + w2 + w3) / 3.0;
    float interferI = interfer * interfer;

    // Sub-bass dilates the radial coordinate the seal is etched in, so the whole
    // mandala swells outward on drones. Only the radius term is scaled -- the t
    // phase terms below stay untouched so the rings keep drifting smoothly.
    float r = length(uv);
    float rBreath = r / (1.0 + 0.35 * audioSubBass);

    // Holographic rainbow dispersion across view angle & position
    float foilAngle = atan(uv.y, uv.x) + rBreath * 4.0 + t * 0.5;
    vec3 foilRainbow = vec3(
        sin(foilAngle * rBow),
        sin(foilAngle * rBow + 2.094),
        sin(foilAngle * rBow + 4.188)
    ) * 0.5 + 0.5;

    // Micro-etched mandala rings
    float rings = sin(rBreath * 35.0 - t * 4.0);
    float ringGlow = smoothstep(0.8, 1.0, abs(rings));

    // Sample distorted background photo
    vec2 sampleUV = fract(p * 0.4 + vec2(interfer * 0.05) + 0.5);
    vec3 texCol = img(sampleUV);

    // Palette mixing
    vec3 palBase = imgPalette(r * 0.5 + 0.2);
    vec3 baseCol = mix(texCol, palBase, 0.4);

    // Add holographic rainbow interference & laser nodes
    vec3 holoSparkle = foilRainbow * (interferI * 1.8 + ringGlow * 0.8) * glw * (1.0 + 2.5 * audioKick);
    vec3 finalCol = baseCol * 0.5 + holoSparkle;

    // Laser node peak flashes
    float laserNode = pow(max(0.0, interfer), 8.0) * (1.5 + 3.0 * audioKick);
    finalCol += vec3(1.8, 1.7, 2.0) * laserNode;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
