#version 330 core
out vec4 fragColor;
/**
 * @file AlcubierreWarpDriveHighway.frag
 * @brief ALCUBIERRE WARP DRIVE HIGHWAY: Faster-than-light warp bubble flight in curved
 * spacetime based on the Alcubierre metric. Spacetime compression ahead (blueshift gleam),
 * expansion behind (redshift), and glowing negative-energy exotic matter containment rings.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives extreme relativistic warp drive forward progression
 *   audioKick    -> flashes exotic matter warp bubble nodes & spacetime compression burst
 *   audioCentroid-> sharpens radial warp ring resolution & Doppler color shift
 *   audioSubBass -> expands warp bubble diameter breathing
 *   audioChromaHue-> steers the extreme Doppler blueshift / redshift spectrum
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
uniform float warpFactorP;
uniform float ringCountP;
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
    float wFactor = (warpFactorP > 0.01) ? warpFactorP : 1.2;
    float nRings = (ringCountP > 1.0) ? ringCountP : 6.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.45 * spd;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Alcubierre shaping function: f(r_s) = (tanh(sigma*(r_s + R)) - tanh(sigma*(r_s - R))) / (2*tanh(sigma*R))
    float sigma = 6.0;
    float R_warp = 0.55 * (1.0 + 0.15 * sin(audioSwell * 2.0) + 0.1 * audioSubBass);
    float fWarp = (tanh(sigma * (r + R_warp)) - tanh(sigma * (r - R_warp))) / (2.0 * tanh(sigma * R_warp));

    // Relativistic forward coordinate distortion
    vec2 uvWarp = uv * (1.0 + fWarp * 2.5 * wFactor);

    // Exotic matter warp ring containment pulses
    // Brightness raises the RADIAL frequency only; the t-coefficient stays fixed
    // so the travelling phase is never remapped mid-flight.
    float ringPhase = r * (12.0 * (nRings / 6.0)) * (1.0 + 0.4 * audioCentroid) - t * 6.0;
    float ringGlow = smoothstep(0.8 + 0.12 * audioCentroid, 1.0, abs(sin(ringPhase))) * glw;

    // Radial hyper-speed star streaks
    float streaks = abs(sin(a * 20.0 + sin(r * 15.0) * 2.0));
    float streakGlow = smoothstep(0.88, 1.0, streaks) * (0.8 + 1.2 * audioHigh);

    // Sample distorted background photo
    vec2 sampleUV = fract(uvWarp * 0.4 + vec2(t * 0.1, 0.0) + 0.5);
    vec3 texCol = img(sampleUV);

    // Doppler shift: center blueshift (hot cyan/white), edge redshift (magenta/amber)
    vec3 blueshiftCol = vec3(0.3, 1.4, 2.0);
    vec3 redshiftCol  = vec3(1.8, 0.4, 0.6);
    vec3 dopplerCol = mix(blueshiftCol, redshiftCol, clamp(r / R_warp - 0.3 * audioCentroid, 0.0, 1.0));

    vec3 palBase = imgPalette(r * 0.8 + 0.2);
    vec3 col = mix(texCol, palBase, 0.45) * dopplerCol;

    // Add glowing exotic matter rings & star streaks
    vec3 ringTint = vec3(1.4, 1.1, 1.8) * ringGlow * (1.0 + 2.5 * audioKick);
    vec3 streakTint = vec3(1.6, 1.6, 2.0) * streakGlow * (1.0 + 2.0 * audioKick);
    col += ringTint + streakTint;

    // Forward warp singularity apex flare
    float apexFlare = exp(-r * 10.0) * (1.5 + 3.5 * audioKick);
    col += vec3(1.8, 1.8, 2.0) * apexFlare;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
