#version 330 core
out vec4 fragColor;
/**
 * @file LogarithmicSpiralChamberZoom.frag
 * @brief LOGARITHMIC SPIRAL CHAMBER ZOOM: Infinite scale plunge into the golden-ratio
 * chambers of a logarithmic spiral (Nautilus shell). Iridescent mother-of-pearl (nacre)
 * septum walls, seamless octave zoom transitions, and glowing spiral vortex currents.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous exponential spiral chamber plunge
 *   audioKick    -> flashes nacre chamber septum walls & explodes vortex core
 *   audioCentroid-> sharpens spiral growth rate b & fine chamber ribbing
 *   audioSubBass -> expands spiral chamber width breathing
 *   audioChromaHue-> steers the iridescent mother-of-pearl (nacre) spectrum
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
uniform float spiralGrowthP;
uniform float chambersP;
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
    float sGrowth = (spiralGrowthP > 0.01) ? spiralGrowthP : 0.306349; // Golden ratio growth: ln(phi)/(pi/2)
    float nChamb = (chambersP > 1.0) ? chambersP : 8.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    float r = max(1e-5, length(uv));
    float a = atan(uv.y, uv.x);

    // Log-polar spiral coordinate: theta_spiral = a - ln(r)/b
    float thetaSpiral = a - (log(r) / sGrowth) + t * 2.0;

    // Chamber phase along logarithmic spiral
    float chamberIndex = thetaSpiral * (nChamb / 6.2831853);
    float chamberFrac = fract(chamberIndex);

    // Distance to chamber septum wall
    float dSeptum = abs(chamberFrac - 0.5);
    float septumGlow = smoothstep(0.42, 0.5, dSeptum) * glw;

    // Mother-of-pearl (nacre) thin-film iridescence
    float nacrePhase = log(r) * 4.0 + a * 2.0 + t * 0.5;
    vec3 nacreRainbow = vec3(
        sin(nacrePhase),
        sin(nacrePhase + 2.094),
        sin(nacrePhase + 4.188)
    ) * 0.5 + 0.5;

    // Sample distorted background photo
    vec2 sampleUV = fract(vec2(chamberFrac, a / 6.2831853 + 0.5));
    vec3 texCol = img(sampleUV);

    // Golden spiral palette
    vec3 palA = imgPalette(floor(chamberIndex) * 0.15 + t * 0.05);
    vec3 palB = imgPalette(floor(chamberIndex) * 0.15 + 0.5);
    vec3 baseCol = mix(palA, palB, chamberFrac);

    baseCol = mix(baseCol, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing septum walls & iridescent nacre highlights
    vec3 septumTint = vec3(1.5, 1.3, 1.7) * septumGlow * (1.0 + 2.5 * audioKick);
    vec3 nacreTint = nacreRainbow * 0.35 * (0.8 + 0.6 * audioCentroid);

    vec3 finalCol = baseCol + septumTint + nacreTint;

    // Center spiral origin singularity bloom
    float centerBloom = exp(-r * 8.0) * (1.2 + 2.5 * audioKick);
    finalCol += imgPalette(0.85) * centerBloom;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
