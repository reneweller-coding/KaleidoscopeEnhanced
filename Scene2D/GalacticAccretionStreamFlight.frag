#version 330 core
out vec4 fragColor;
/**
 * @file GalacticAccretionStreamFlight.frag
 * @brief GALACTIC ACCRETION STREAM FLIGHT: Relativistic helical flight along magnetic
 * flux tubes directly into a supermassive black hole quasar accretion disk with
 * synchrotron radiation jets, Doppler-boosted plasma streams, and event horizon plunges.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous high-velocity helical plunge trajectory
 *   audioKick    -> flashes accretion disk reconnection bursts & jet shockwaves
 *   audioCentroid-> modulates synchrotron radiation frequency & plasma filament density
 *   audioSubBass -> expands accretion disk magnetic coil breathing
 *   audioChromaHue-> steers the relativistic plasma spectrum
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
uniform float helixP;
uniform float jetIntensityP;
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
    float hlx = (helixP > 0.01) ? helixP : 1.0;
    float jetInt = (jetIntensityP > 0.01) ? jetIntensityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.228 * spd + audioAdvance * 0.228 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Helical camera path plunging into black hole core
    float sHel = t * 1.5;
    float rHel = (2.2 + 0.4 * sin(audioSwell * 2.0)) * hlx;
    vec3 ro = vec3(rHel * cos(sHel * 0.6), 1.2 * sin(sHel * 0.3), rHel * sin(sHel * 0.6));
    vec3 ta = vec3(0.0, 0.0, 0.0); // Looking at black hole center

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.2 + 0.2 * sin(audioSwell)) * ww);

    // Volumetric raymarching of accretion disk and synchrotron jets
    vec3 colAcc = vec3(0.0);
    float totDist = 0.0;
    float plasmaAcc = 0.0;
    float jetAcc = 0.0;

    for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * totDist;
        float rDisk = length(p.xz);
        float yDisk = p.y;

        // Thin Keplerian accretion disk in XZ plane
        float diskDensity = exp(-abs(yDisk) * (12.0 - 4.0 * audioSubBass)) *
                            smoothstep(0.4, 0.8, rDisk) * smoothstep(4.5, 1.5, rDisk);

        // Relativistic spiral arms in accretion disk
        float diskAngle = atan(p.z, p.x) + (3.0 / max(0.5, rDisk)) - t * 2.5;
        // Brightness raises the synchrotron harmonic by crossfading a coarse and a
        // fine ribbon instead of scaling diskAngle -- diskAngle carries a t term, so
        // an audio-varying frequency multiplier would remap the whole accumulated
        // phase every frame (flicker). Contrast rises with it, tightening filaments.
        float spiralRibbon = mix(sin(diskAngle * 4.0), sin(diskAngle * 11.0), 0.55 * audioCentroid) * 0.5 + 0.5;
        diskDensity *= (0.6 - 0.15 * audioCentroid) + (0.4 + 0.15 * audioCentroid) * spiralRibbon;

        plasmaAcc += diskDensity * (0.04 + 0.05 * audioLevel);

        // Relativistic vertical plasma jets along Y-axis
        float jetRadius = 0.35 + abs(yDisk) * 0.15;
        float jetDensity = exp(-rDisk * rDisk / (jetRadius * jetRadius)) * smoothstep(0.2, 1.5, abs(yDisk));
        jetAcc += jetDensity * (0.02 + 0.03 * audioHigh) * jetInt;

        totDist += 0.08;
    }

    // Central black hole event horizon silhouette
    vec2 centerUV = uv;
    float centerDist = length(centerUV);
    float horizonMask = smoothstep(0.18, 0.25, centerDist);

    // Dynamic texture sample mapped across accretion disk coordinates
    vec2 sampleUV = fract(uv * 0.4 + vec2(t * 0.1, 0.0));
    vec3 texCol = img(sampleUV);

    // Multi-temperature accretion plasma palette (golden-white inner disk to deep red outer rim)
    vec3 palInner = imgPalette(plasmaAcc * 0.2 + 0.1);
    vec3 palJet = imgPalette(jetAcc * 0.3 + 0.7);

    vec3 plasmaCol = mix(palInner, texCol, 0.35);
    vec3 jetCol = vec3(0.3, 1.2, 1.9) * jetAcc * (1.0 + 2.0 * audioKick) * glw;

    vec3 finalCol = (plasmaCol * plasmaAcc * 2.5 + jetCol) * horizonMask;

    // Photon ring flare around event horizon
    float photonRing = exp(-abs(centerDist - 0.22) * 45.0) * (1.5 + 3.0 * audioKick);
    finalCol += vec3(1.8, 1.5, 1.1) * photonRing;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
