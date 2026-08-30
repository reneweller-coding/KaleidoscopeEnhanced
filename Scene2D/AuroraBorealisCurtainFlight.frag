#version 330 core
out vec4 fragColor;
/**
 * @file AuroraBorealisCurtainFlight.frag
 * @brief AURORA BOREALIS CURTAIN FLIGHT: Volumetric 3D flight directly through
 * rippling multilayered solar ionosphere Aurora curtains with vertical ray shooting,
 * emerald-to-violet geomagnetic ionization glows, and deep cosmic star fields.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight through the aurora curtains
 *   audioKick    -> flashes vertical geomagnetic particle surges & curtain burst
 *   audioCentroid-> sharpens vertical ray shooting filament resolution
 *   audioSubBass -> expands curtain wave amplitude breathing
 *   audioChromaHue-> steers the geomagnetic fluorescent spectrum
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
uniform float curtainCountP;
uniform float waveP;
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
    float nCurtains = (curtainCountP > 1.0) ? curtainCountP : 4.0;
    float wv = (waveP > 0.01) ? waveP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Flight camera position floating among aurora curtains
    vec3 ro = vec3(sin(t * 0.3) * 0.5, 0.0, t * 2.0);
    vec3 rd = normalize(vec3(uv.x, uv.y + 0.1, 1.25 + 0.2 * sin(audioSwell * 2.0)));

    vec3 auroraAcc = vec3(0.0);
    float totDist = 0.0;

    // Volumetric curtain raymarching loop
    for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * totDist;

        // Multilayered curtain wave functions along X and Z
        int numC = int(clamp(nCurtains, 2.0, 5.0));
        for (int k = 0; k < 4; k++) {
            if (k >= numC) break;
            float kf = float(k);

            // Curtain baseline position along X
            // Sub-bass swells the sway AMPLITUDE only -- the wave's phase terms
            // stay untouched so the curtains never jump sideways on a bass hit.
            float curtainX = sin(p.z * 0.4 + t * 0.8 + kf * 1.5) * (1.2 * wv) * (1.0 + 0.4 * audioSubBass) + (kf - 1.5) * 1.0;
            float dCurtain = abs(p.x - curtainX);

            // Vertical height envelope: Aurora glows brightest between y = -0.5 and y = 1.5
            float heightEnvelope = exp(-abs(p.y - 0.5) * 1.8);

            // Vertical shooting ray filaments
            float rayFilament = sin(p.x * (15.0 + 8.0 * audioCentroid) + p.z * 5.0 - t * 4.0) * 0.5 + 0.5;
            rayFilament = pow(rayFilament, 3.0);

            // Ionization density at this sample point
            float density = exp(-dCurtain * 14.0) * heightEnvelope * (0.4 + 0.6 * rayFilament);
            density *= (0.025 + 0.035 * audioLevel);

            // Aurora vertical color gradient: Emerald green at bottom (p.y < 0.2), Violet/Magenta at top (p.y > 0.5)
            vec3 palBottom = vec3(0.1, 1.4, 0.6); // Atomic Oxygen 557.7 nm
            vec3 palTop = vec3(1.2, 0.2, 1.6);    // Molecular Nitrogen
            vec3 curtainCol = mix(palBottom, palTop, clamp((p.y + 0.2) / 1.2, 0.0, 1.0));

            // Blend with slideshow image palette
            curtainCol = mix(curtainCol, imgPalette(kf * 0.25 + p.y * 0.3), 0.4);

            auroraAcc += curtainCol * density * (1.0 + 2.0 * audioKick) * glw;
        }

        totDist += 0.09;
    }

    // Deep cosmic background starfield with texture sample
    // SPIEGEL-Kachelung statt fract(): die harte Wrap-Naht des driftenden
    // Fotos war die gemeldete sichtbare Kante im Hintergrund.
    vec2 skyRaw = uv * 0.3 + vec2(t * 0.02, 0.0);
    vec2 skyUV = abs(fract(skyRaw * 0.5) * 2.0 - 1.0);
    vec3 skyTex = img(skyUV);
    vec3 bgNight = mix(imgPalette(0.1) * 0.15, skyTex * 0.2, 0.5);

    vec3 finalCol = bgNight + auroraAcc;

    // Atmospheric horizon glow
    float horizonGlow = exp(-abs(uv.y + 0.2) * 5.0) * 0.25 * audioSwell;
    finalCol += imgPalette(0.4) * horizonGlow;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
