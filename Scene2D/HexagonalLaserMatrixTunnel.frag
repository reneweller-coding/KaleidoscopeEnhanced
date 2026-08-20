#version 330 core
out vec4 fragColor;
/**
 * @file HexagonalLaserMatrixTunnel.frag
 * @brief HEXAGONAL LASER MATRIX TUNNEL: High-speed flight through a 6-sided mirror tunnel
 * laced with intersecting 3D laser projector beams, opening geometric light portals,
 * and high-voltage laser matrix scanning grids.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight speed through the laser tunnel
 *   audioKick    -> flashes laser portal gates & triggers radial matrix beam bursts
 *   audioCentroid-> modulates laser grid frequency & beam sharpness
 *   audioSubBass -> expands hexagonal tunnel lumen diameter
 *   audioChromaHue-> rotates the glowing RGB laser matrix spectrum
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
uniform float laserDensityP;
uniform float tunnelRadiusP;
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

// 2D Hexagonal boundary distance
float sdHexagon(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float lDens = (laserDensityP > 0.01) ? laserDensityP : 1.0;
    float tRad = (tunnelRadiusP > 0.01) ? tunnelRadiusP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // The flight only advanced on audioAdvance (~0.25 units/s on quiet material).
    // Constant base rate + audio surge; the coefficient on `time` is a
    // per-activation constant, so this is anti-flicker safe.
    float t = time * 0.40 * spd + audioAdvance * 0.45 * spd;

    // Flight camera position
    vec3 ro = vec3(sin(t * 0.3) * 0.2, cos(t * 0.25) * 0.2, t * 3.5);
    vec3 rd = normalize(vec3(uv, 1.25 + 0.2 * sin(audioSwell * 2.0)));

    // Raymarching to hit hexagonal tunnel wall
    float totDist = 0.0;
    vec3 hitPos = vec3(0.0);
    float laserBeamsAcc = 0.0;
    // A wider lumen gives the flight real depth: with the old 1.2-unit radius a
    // ray reached the wall in about two units and the tunnel had no length to it.
    float rHex = tRad * 2.6 * (1.0 + 0.1 * sin(audioSubBass));

    for (int i = 0; i < 56; i++) {
        vec3 p = ro + rd * totDist;
        hitPos = p;   // always valid, even for a ray that runs the loop out

        // Distance from inside the lumen to the hexagonal wall.
        // This was `rHex - sdHexagon(...)`, which is not that distance at all:
        // inside the hexagon sdHexagon is negative, so the expression sat at
        // rHex..2*rHex and only reached zero a full rHex OUTSIDE the tunnel.
        // The march therefore blew straight through the wall and stopped on a
        // phantom surface at double radius -- or ran out to the 14-unit cap,
        // where the fog below washed the result into one flat tone.
        float dWall = -sdHexagon(p.xy, rHex);

        // Volumetric laser cross-beams inside tunnel
        // Brightness selects the grid harmonic by crossfading a coarse and a 3x
        // finer gate lattice instead of scaling p.z -- p.z carries the flight
        // distance, so an audio-varying frequency there would relocate every gate
        // in a single frame (flicker). The 3x lattice shares gate planes with the
        // coarse one, so the crossfade stays continuous.
        float zGate = fract(p.z * (0.8 * lDens)) - 0.5;
        float zGateFine = fract(p.z * (2.4 * lDens)) - 0.5;
        // Six-fold beam LATTICE rather than the two centre lines the old
        // min(|p.x|,|p.y|) drew: three beam planes at 60 degrees, each repeated
        // across the lumen, so the matrix covers the whole tunnel cross-section
        // right out to the walls instead of only its axis. Repetition period is
        // a per-activation constant, so no gate ever moves with the audio.
        float g  = 1.6 * lDens;
        float b0 = abs(fract(p.x * g) - 0.5) / g;
        float b1 = abs(fract((p.x * 0.5 - p.y * 0.8660254) * g) - 0.5) / g;
        float b2 = abs(fract((p.x * 0.5 + p.y * 0.8660254) * g) - 0.5) / g;
        float dBeam = min(b0, min(b1, b2));

        float dLaser = dBeam + mix(abs(zGate), abs(zGateFine), 0.6 * audioCentroid) * 0.4;
        laserBeamsAcc += exp(-dLaser * (18.0 + 12.0 * audioCentroid)) * 0.026;

        if (dWall < 0.005 || totDist > 22.0) break;

        totDist += max(0.02, dWall * 0.7);
    }
    laserBeamsAcc = min(laserBeamsAcc, 1.0);

    // Hexagonal wall mirror texture
    vec2 sampleUV = fract(hitPos.xy * 0.3 + hitPos.z * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);
    vec3 palCol = imgPalette(hitPos.z * 0.15 + 0.2);

    vec3 wallBase = mix(texCol * 0.3, palCol, 0.45);

    // Mirror panel seams on the hexagonal wall: 18 facet edges around the lumen
    // and a rib every ~1.1 units of flight. Without them the wall was a smooth
    // photo blur and carried no structure for the outer half of the frame.
    float ang6  = atan(hitPos.y, hitPos.x);
    float seamA = abs(fract(ang6 * 2.8648) - 0.5);
    float seamZ = abs(fract(hitPos.z * 0.9) - 0.5);
    float seam  = exp(-min(seamA, seamZ) * 22.0);
    wallBase += imgPalette(0.35) * seam * 0.30 * (0.6 + 0.6 * audioMid);

    // Glowing laser beams & portal gate bursts. The tint constants exceed 1.0
    // per channel, so the cap has to sit on the TINTED vector.
    vec3 laserTint = min(vec3(1.3, 1.6, 2.0) * laserBeamsAcc * (1.0 + 3.0 * audioKick) * glw,
                         vec3(0.95, 0.95, 1.0));
    vec3 finalCol = wallBase + laserTint;

    // Atmospheric depth fog. Halved: at 0.18 the long axial rays (the whole
    // middle of the frame) reached fog ~1 and dissolved into a single flat tone.
    float depthFog = 1.0 - exp(-totDist * 0.09);
    finalCol = mix(finalCol, imgPalette(0.8) * 0.34 + laserTint * 0.45, depthFog * 0.85);

    finalCol = pow(min(finalCol, vec3(1.0)), vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
