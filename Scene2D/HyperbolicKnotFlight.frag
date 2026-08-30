#version 330 core
out vec4 fragColor;
/**
 * @file HyperbolicKnotFlight.frag
 * @brief HYPERBOLIC KNOT FLIGHT: High-G 3D roller-coaster ride along a parametric
 * (p, q) torus knot curve with Frenet-Serret camera banking, concentric neon
 * plasma rings, reflective mirror-chamber walls, and dynamic velocity boosts.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous roller coaster forward progress along the knot
 *   audioKick    -> accelerates flight velocity in loopings & flashes plasma rings
 *   audioCentroid-> modulates knot p/q harmonic frequencies & track twist
 *   audioSubBass -> expands plasma ring diameter breathing
 *   audioChromaHue-> rotates the neon roller coaster spectrum
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
uniform float knotP;
uniform float tubeRadiusP;
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

// Overall level of the photo currently bound, from a fixed 5-tap grid. The
// mirror-chamber walls and the palette are entirely photo-derived and the
// library spans near-black to near-white, which is half of why this flight
// sat at a tenth of its intended exposure. The probe rides the tex0/tex1
// crossfade so the gain can never pop, and one number for the whole frame
// rescales exposure without touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// Parametric (p, q) torus knot position: r(s)
vec3 knotCurve(float s, float pParam, float qParam) {
    float rMajor = 2.4;
    float rMinor = 0.9;
    float phi = pParam * s;
    float theta = qParam * s;

    float r = rMajor + rMinor * cos(theta);
    return vec3(r * cos(phi), r * sin(phi), rMinor * sin(theta));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float kMod = (knotP > 0.01) ? knotP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Torus knot harmonic frequencies (e.g. 2, 3 trefoil or 3, 5 knot)
    float pParam = 2.0;
    float qParam = 3.0 + floor(kMod * 1.5);

    // Camera ride coordinate along knot parameter s
    float sCam = t * 0.5;
    vec3 trackPos = knotCurve(sCam, pParam, qParam);
    vec3 ta = knotCurve(sCam + 0.08, pParam, qParam);

    // Frenet-Serret tangent, normal, binormal frame
    vec3 T = normalize(ta - trackPos);
    vec3 upApprox = normalize(knotCurve(sCam + 0.08, pParam, qParam) - knotCurve(sCam - 0.08, pParam, qParam) + vec3(0,0,1));
    vec3 N = normalize(cross(T, upApprox));
    vec3 B = cross(N, T);

    // Roll banking in turns
    float rollAngle = sin(sCam * qParam) * 0.4 + 0.2 * audioFlux;
    float csR = cos(rollAngle), snR = sin(rollAngle);
    vec3 right = N * csR - B * snR;
    vec3 up = N * snR + B * csR;

    // Chase-cam offset: riding the rail itself puts the camera's own start
    // position ON the knot curve, so the very first raymarch step (p = ro,
    // before any travel) trivially satisfies "distance to rail < threshold"
    // for EVERY pixel regardless of ray direction -- an instant, uniform hit
    // that reads as a flat wash instead of a tube flying past.
    vec3 ro = trackPos - up * 0.4;

    vec3 rd = normalize(uv.x * right + uv.y * up + (1.2 + 0.2 * sin(audioSwell * 2.0)) * T);

    // Raymarch through knot track and surrounding neon chamber
    float totDist = 0.0;
    float minTrackDist = 1e4;
    vec3 hitCol = vec3(0.0);
    float ringGlowAcc = 0.0;
    bool hit = false;

    for (int i = 0; i < 56; i++) {
        vec3 p = ro + rd * totDist;

        // Distance to surrounding reflective cubic mirror chamber
        vec3 qRoom = abs(p) - vec3(3.8);
        float dRoom = -max(max(qRoom.x, qRoom.y), qRoom.z);

        // Distance to the knot rail tube
        // Sample nearest knot curve point
        float sApprox = sCam + totDist * 0.15;
        vec3 pKnot = knotCurve(sApprox, pParam, qParam);
        float dRail = length(p - pKnot) - (0.08 + 0.03 * audioLevel);

        // Periodic glowing neon rings along the rail
        float ringDist = abs(sin(sApprox * 25.0 - t * 4.0));
        // Sub-bass softens the radial falloff instead of adding light: the ring
        // reaches further out from the rail (a visibly fatter plasma hoop) while
        // its on-rail peak, which the tint constants are balanced against, is
        // exactly unchanged.
        ringGlowAcc += exp(-max(0.0, dRail) * 10.0 / (1.0 + 0.4 * audioSubBass)) * smoothstep(0.8, 1.0, ringDist) * (0.06 + 0.09 * audioKick);

        float d = min(dRail, abs(dRoom));
        minTrackDist = min(minTrackDist, dRail);

        // dRail is measured against a curve point that slides FORWARD with the
        // march (sApprox tracks totDist), so it is not a conservative distance
        // and for the whole forward cone it sat near-constant around 0.35,
        // pinning the step size. The far-plane arm therefore has to be
        // reachable within the iteration budget, and `i >= 55` guarantees the
        // pixel resolves to chamber colour rather than falling out of the loop
        // unshaded.
        if (d < 0.005 || totDist > 11.0 || i >= 55) {
            hit = true;
            vec2 sampleUV = fract(p.xy * 0.2 + p.z * 0.2 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 pal = imgPalette(sApprox * 0.1 + t * 0.05);
            // d is ~0 at every hit, so the old (0.7 + 0.4 * (1.0 - d)) term
            // was a constant 1.1 and the chamber had no depth cue at all.
            // Fade with travelled distance instead: near rail-side geometry
            // stays bright, the far end of the chamber falls away.
            hitCol = mix(texCol, pal, 0.5) * (0.55 + 0.70 * exp(-totDist * 0.22));
            break;
        }

        totDist += max(0.02, d * 0.7);
    }

    // Glowing rail lines & plasma rings
    float railGlow = exp(-max(0.0, minTrackDist) * (24.0 + 12.0 * audioCentroid)) * glw;
    // The tint exceeds 1.0 per channel on its own and ringGlowAcc accumulates
    // over the whole march, so the TINTED vector is what has to be capped.
    vec3 railTint = min(vec3(1.3, 1.0, 1.7) * (railGlow + ringGlowAcc) * (1.0 + 2.5 * audioKick), vec3(1.3));

    // Background laser chamber grid. The old selector was
    // mix(bg, hitCol, clamp(length(hitCol), 0, 1)): intended as a "did we
    // hit?" test, it doubles as a brightness crusher -- with a dark photo a
    // genuine wall hit has length ~0.18, so it blended 82% of the (even
    // darker, 0.2-scaled) background back over the top. That, not the march,
    // is what left this flight at a tenth of its intended exposure. Select on
    // the march's own hit flag instead.
    vec3 bgCol = imgPalette(0.3) * (0.30 + 0.18 * audioLevel);
    vec3 finalCol = hit ? hitCol : bgCol;

    // Everything above is photo-derived: put the chamber on a fixed exposure
    // rather than inheriting whatever image happens to be bound.
    finalCol *= clamp(0.30 / max(0.05, photoLevel()), 0.40, 3.0);
    finalCol += railTint;

    finalCol = pow(finalCol, vec3(0.88));
    vec3 _catTone = clamp(finalCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.26 * max(_catTone.r, max(_catTone.g, _catTone.b));
    _catTone /= 1.0 + 0.50 * max(_catTone.r, max(_catTone.g, _catTone.b));   // peak knee: tame local glare, keep midtones
    fragColor = vec4(_catTone, 1.0);
}
