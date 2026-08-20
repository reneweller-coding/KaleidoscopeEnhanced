#version 330 core
out vec4 fragColor;
/**
 * @file QuantumWormholeFlythrough.frag
 * @brief QUANTUM WORMHOLE FLYTHROUGH: Relativistic Kerr wormhole transit raytracing.
 * Gravitational lensing around the photon ring throat, seamless universe transit,
 * Doppler blue/redshift optical distortions, and cosmic void shockwaves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives relativistic forward plunge through the wormhole throat
 *   audioKick    -> flashes throat event singularity & gravitational wave chirp
 *   audioCentroid-> modulates photon ring diffraction ring density
 *   audioSubBass -> expands throat diameter breathing
 *   audioChromaHue-> shifts universe 1 vs universe 2 chromatic palette
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
uniform float throatRadiusP;
uniform float spinP;
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
    float rThroat = (throatRadiusP > 0.01) ? throatRadiusP : 0.8;
    float aSpin = (spinP > 0.01) ? spinP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Relativistic camera flight along wormhole Z-axis
    // zThroat goes continuously from -infinity to +infinity (repeating universe cycles)
    float zFlight = t * 1.8;
    float cycleZ = mod(zFlight, 8.0) - 4.0; // Distance to throat center at z = 0
    bool universe2 = (mod(floor(zFlight / 8.0), 2.0) == 1.0);

    vec3 ro = vec3(0.0, 0.0, cycleZ);
    vec3 rd = normalize(vec3(uv, 1.3 + 0.2 * sin(audioSwell * 2.0)));

    // Ray deflection in Ellis/Kerr wormhole metric: ds^2 = -dt^2 + dl^2 + (r0^2 + l^2)(dtheta^2 + sin^2 theta dphi^2)
    vec3 p = ro;
    float totDist = 0.0;
    float minThroatDist = 1e4;
    float ringGlow = 0.0;

    for (int i = 0; i < 48; i++) {
        float l = p.z; // Coordinate along throat
        float rSq = dot(p.xy, p.xy);
        float r = sqrt(rSq);

        // Effective wormhole radial throat radius
        float rThroatEff = rThroat * (1.0 + 0.15 * sin(audioSwell * 2.5) + 0.1 * audioSubBass);
        float R_l = sqrt(rThroatEff * rThroatEff + l * l);

        // Gravitational lensing curvature acceleration
        vec2 d2r = -p.xy * (1.2 / pow(rSq + 0.1, 1.5)) * (rThroatEff / max(0.5, R_l));
        rd.xy += d2r * 0.08;
        rd = normalize(rd);

        // Kerr frame dragging spin
        float spinAngle = aSpin * (0.04 / (rSq + 0.2)) * (1.0 + audioFlux);
        float csS = cos(spinAngle), snS = sin(spinAngle);
        rd.xy = mat2(csS, -snS, snS, csS) * rd.xy;

        float stepSize = max(0.03, min(r, abs(l)) * 0.4);
        p += rd * stepSize;
        totDist += stepSize;

        minThroatDist = min(minThroatDist, abs(length(p.xy) - rThroatEff) + abs(l));
        ringGlow += exp(-minThroatDist * 8.0) * (0.02 + 0.03 * audioLevel);

        if (totDist > 10.0) break;
    }

    // Determine exit universe: l > 0 vs l < 0
    bool inOtherUniverse = (p.z > 0.0);
    if (universe2) inOtherUniverse = !inOtherUniverse;

    // Map asymptotic ray angles to celestial sphere texture
    vec2 celestialUV = vec2(
        atan(rd.y, rd.x) / 6.2831853 + 0.5,
        acos(clamp(rd.z, -1.0, 1.0)) / 3.14159265
    );

    // Swirl texture mapping at exit
    celestialUV += vec2(t * 0.05, 0.0);
    vec3 starSample = img(fract(celestialUV));

    // Colors of Universe 1 (cool blues/cyans) vs Universe 2 (warm fiery magentas/golds)
    vec3 palU1 = imgPalette(rd.z * 0.5 + 0.2);
    vec3 palU2 = imgPalette(rd.z * 0.5 + 0.7);

    vec3 exitCol = inOtherUniverse ? mix(starSample, palU2, 0.5) : mix(starSample, palU1, 0.5);

    // Photon ring throat laser glow
    float throatLaser = exp(-minThroatDist * (24.0 + 12.0 * audioCentroid)) * glw;
    vec3 laserTint = vec3(1.4, 1.2, 1.8) * (throatLaser + ringGlow * 0.5) * (1.0 + 2.5 * audioKick);

    vec3 finalCol = exitCol + laserTint;

    // Relativistic Doppler redshift/blueshift chromatic ring
    float doppler = 0.02 * (audioFlux + audioKick);
    finalCol.r *= (1.0 + doppler * 8.0);
    finalCol.b *= (1.0 - doppler * 4.0);

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
