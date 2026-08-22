#version 330 core
out vec4 fragColor;
/**
 * @file AcousticBlackHoleEventHorizon.frag
 * @brief ACOUSTIC BLACK HOLE EVENT HORIZON: Sonic black hole (Dumb Hole) in a transsonic superfluid
 * Laval nozzle. Inflowing fluid accelerates past the local speed of sound (Mach > 1), trapping
 * acoustic phonons behind the acoustic event horizon and radiating analog Hawking radiation.
 *   audioAdvance -> accelerates fluid inflow velocity across transsonic Laval nozzle
 *   audioKick    -> flashes spontaneous quantum phonon pair emission (Hawking bursts)
 *   audioBass    -> deepens supersonic acoustic horizon gravitational shadow & ergoregion
 *   audioSwell   -> widens transsonic sonic horizon radius & analog Hawking temperature glow
 *   audioCentroid-> shifts acoustic Bogoliubov dispersion emission spectra
 *
 * Per-activation variety:
 *   machGradP    float fluid acceleration Mach gradient dM/dr    (0.8..2.5)
 *   horizonRadP  float acoustic event horizon sonic radius        (0.2..0.6)
 *   hawkingTempP float analog Hawking radiation brightness gain  (0.8..2.5)
 *   phononWaveP  float trapped sound wave ripple frequency       (8.0..24.0)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float machGradP;
uniform float horizonRadP;
uniform float hawkingTempP;
uniform float phononWaveP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.4 + audioAdvance * 0.35;

    float r = length(uv);
    float theta = atan(uv.y, uv.x);

    // Inflowing fluid velocity field: v(r) ~ -1/r (accelerating inwards)
    float r_H = (horizonRadP > 0.01 ? horizonRadP : 0.38) * (1.0 + 0.2 * audioBass);

    // Local Mach number: M(r) = (r_H / r)^gamma
    float gammaMach = (machGradP > 0.01 ? machGradP : 1.2);
    float Mach = pow(r_H / max(r, 0.01), gammaMach);

    // Acoustic horizon located at Mach = 1 (where r = r_H)
    float sonicHorizon = exp(-abs(r - r_H) * 25.0);

    // Inflowing logarithmic spiral streamlines
    float streamPhase = theta * 4.0 + log(max(r, 0.02)) * 8.0 - t * 3.0 + audioPhase;
    float streamlines = sin(streamPhase) * 0.5 + 0.5;

    // Trapped supersonic phonon waves (inside horizon, r < r_H)
    float pFreq = (phononWaveP > 0.01 ? phononWaveP : 16.0);
    float trappedPhonons = sin(r * pFreq - t * 6.0) * smoothstep(r_H + 0.05, r_H - 0.05, r);

    // Analog Hawking radiation (thermal emission at horizon surface)
    float hawkingGlow = exp(-abs(r - r_H) * 8.0) * (1.0 + 3.5 * audioKick) * (hawkingTempP > 0.01 ? hawkingTempP : 1.3);

    // Supersonic shadow (interior of horizon is pitch black / absorbing)
    float shadow = smoothstep(0.05, r_H + 0.02, r);

    // Color palettes
    vec3 hawkingCol = vec3(1.0, 0.45, 0.15);
    vec3 streamCol  = vec3(0.15, 0.75, 0.95);

    vec3 colHawking = palTint(hawkingCol, r * 0.3 + audioCentroid, 0.28);
    vec3 colStream  = palTint(streamCol, theta * 0.15 + audioCentroid, 0.22);

    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;

    vec3 col = bg * shadow;
    col += colStream * streamlines * shadow * (0.8 + 0.4 * audioSwell);
    col += colHawking * sonicHorizon * 2.2;
    col += vec3(0.95, 0.95, 1.0) * hawkingGlow * 2.0;
    col += colStream * abs(trappedPhonons) * 1.2;
    col += colHawking * (audioKick * 0.35);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    col *= 0.71;   // measured luma 0.708: knee, not a linear trim
    col /= 1.0 + 0.45 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
