#version 330 core
out vec4 fragColor;
/**
 * @file HyperToroidalRollerCoaster.frag
 * @brief HYPER TOROIDAL ROLLER COASTER: Extreme 3D Frenet-Serret camera tracking ride
 * along a complex (3, 7)-torus knot roller-coaster track in hyperspace. Neon laser track rails,
 * high-G bankings and loopings, and chromatic tunnel speed streaks.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward roller-coaster velocity along the knot
 *   audioKick    -> flashes track rail support gantries & triggers inversion burst
 *   audioCentroid-> sharpens tubular rail line resolution & track sparks
 *   audioSubBass -> expands torus knot spatial envelope breathing
 *   audioChromaHue-> rotates the luminous hyperspace track spectrum
 *
 * The (3,7) knot has THREE strands at every azimuth; the old distance estimate
 * only ever found one of them, so two thirds of the track was invisible and the
 * ride happened inside an empty frame.  All three lobes are searched now, the
 * rail carries a volumetric haze and quantised support gantries, and the
 * hyperspace around it is filled with the chromatic speed streaks this header
 * always promised.
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
uniform float railWidthP;
uniform float knotRadiusP;
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

// Parametric (3, 7)-torus knot curve point: gamma(u)
vec3 torusKnotPoint(float u, float R, float r) {
    float p = 3.0, q = 7.0;
    float r_knot = R + r * cos(q * u);
    return vec3(r_knot * cos(p * u), r_knot * sin(p * u), r * sin(q * u));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rW = (railWidthP > 0.01) ? railWidthP : 0.08;
    float kR = (knotRadiusP > 0.01) ? knotRadiusP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.240 * spd + audioAdvance * 0.240 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Sub-bass swells the knot's spatial envelope -- major and minor radius
    // together, so the track keeps its (3,7) shape and simply breathes outward.
    // The chase camera is built from the same parametrisation, so it breathes
    // with the rail instead of being left inside/outside the tube.
    float envB = 1.0 + 0.25 * audioSubBass;
    float R = 2.2 * kR * envB;
    float r = 0.85 * kR * envB * (1.0 + 0.1 * sin(audioSwell * 2.0));

    // Camera track progression parameter u
    float uCam = t * 0.5;
    vec3 trackPos = torusKnotPoint(uCam, R, r);
    vec3 ta = torusKnotPoint(uCam + 0.06, R, r);

    // Frenet frame orientation
    vec3 T = normalize(ta - trackPos);
    vec3 upApprox = normalize(torusKnotPoint(uCam + 0.03, R, r) - trackPos);
    vec3 right = normalize(cross(T, vec3(0.0, 0.0, 1.0) + upApprox * 0.5));
    vec3 up = cross(right, T);

    // Chase-cam offset: riding the rail itself puts the camera's own start
    // position ON the track, so the very first raymarch step (p = ro, before
    // any travel) trivially satisfies "distance to track < threshold" for
    // EVERY pixel regardless of ray direction -- an instant, uniform hit
    // that reads as a flat wash instead of a tube flying past. A small
    // sideways offset is enough to break that; a large pull-back along -T
    // overshoots past where totDist's max range (10.0) can still reach the
    // rail, which is worse (fully blank instead of just off-centre).
    vec3 ro = trackPos - up * (rW * 3.0 + 0.15);

    // Wider lens: at 1.25 the ride occupied a small central cone of the frame.
    vec3 rd = normalize(uv.x * right + uv.y * up + (1.00 + 0.15 * sin(audioSwell * 2.0)) * T);

    // Raymarching through track tube
    float totDist = 0.0;
    float minTrackDist = 1e4;
    float railHaze = 0.0;
    float gantryAcc = 0.0;
    vec3 hitCol = vec3(0.0);
    bool hit = false;

    for (int i = 0; i < 36; i++) {
        vec3 p = ro + rd * totDist;

        // Distance to the closest point on the knot.  gamma(u) has azimuth 3u
        // exactly, so the three curve points sharing this pixel's azimuth are
        // u = (az + 2*pi*k)/3, k = 0,1,2 -- checking only k = 0 threw away two
        // thirds of the (3,7) track.
        float az = atan(p.y, p.x);
        float bestD = 1e4;
        float bestU = 0.0;
        for (int k = 0; k < 3; k++) {
            float uk = (az + 6.2831853 * float(k)) / 3.0;
            vec3  pk = torusKnotPoint(uk, R, r);
            float dk = length(p - pk);
            if (dk < bestD) { bestD = dk; bestU = uk; }
        }
        float dTrack = bestD - rW;
        minTrackDist = min(minTrackDist, dTrack);

        float stepLen = max(0.02, dTrack * 0.6);

        // The chase cam rides within half a unit of its own rail, so the first
        // samples are identical for EVERY pixel: without this ramp they would
        // pump the whole frame up and down together as the camera passed each
        // gantry, which is exactly the sort of frame-wide jump the catalogue
        // scan penalises.
        float nearFade = smoothstep(0.0, 0.85, totDist);

        // Volumetric rail haze: every strand the ray passes near now leaves
        // light in the frame, not just the single nearest one.
        railHaze += exp(-max(dTrack, 0.0) * 4.5) * stepLen * 0.65 * nearFade;

        // Support gantries: rings clamped around the tube, 28 per turn of u.
        float gfrac = abs(fract(bestU * 4.4563) - 0.5);
        gantryAcc += exp(-gfrac * 18.0) * exp(-abs(bestD - rW * 3.0) * 8.0)
                   * stepLen * 1.7 * nearFade;

        if (dTrack < 0.005) {
            // Mirrored wrap -- fract() left a seam sliding through the tube.
            vec2 sampleUV = abs(fract(vec2(bestU * 0.25, p.z * 0.15)) * 2.0 - 1.0);
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(bestU * 0.2 + t * 0.05);
            hitCol = mix(texCol, palCol, 0.5) * (0.7 + 0.4 * (1.0 - dTrack));
            hit = true;
            break;
        }

        totDist += stepLen;
        if (totDist > 12.0) break;
    }

    // Glowing laser track rails & support rings
    float railGlow = exp(-minTrackDist * (24.0 + 12.0 * audioCentroid)) * glw;
    vec3 railTint = min(vec3(1.4, 1.1, 1.8) * railGlow * (1.0 + 1.6 * audioKick), vec3(1.1));

    // --- hyperspace: chromatic speed streaks over the whole frame ----------
    float ang = atan(uv.y, uv.x);
    float rad = length(uv);
    float streak = 0.0;
    for (int s = 0; s < 3; s++) {
        float fs = float(s);
        float kAng = 17.0 + fs * 26.0;
        float radial = pow(max(0.0, sin(ang * kAng + fs * 1.73)), 18.0 - fs * 4.0);
        // cos() instead of a fract() ramp: the streak heads sweep outward
        // continuously instead of popping when the ramp wraps.
        float head = pow(0.5 + 0.5 * cos(6.2831853 * (rad * 2.2 - t * (0.9 + 0.4 * fs) + fs * 0.37)), 6.0);
        streak += radial * head * (0.50 - fs * 0.12);
    }
    streak *= smoothstep(0.04, 0.42, rad) * (0.55 + 0.75 * audioLevel + 0.6 * audioHigh);

    vec3 pal = imgPalette(length(uv) * 0.4 + 0.2);
    vec3 bgCol = pal * (0.17 + 0.13 * audioLevel);
    // Far hyperspace shell so the corners read as depth, not as nothing.
    bgCol += imgPalette(0.63 - rad * 0.3) * (0.09 + 0.06 * audioSwell) * smoothstep(0.10, 0.70, rad);
    bgCol += min(streak, 1.0) * mix(pal, vec3(0.75, 0.72, 0.95), 0.45) * 0.55;

    vec3 finalCol = bgCol;
    if (hit) finalCol = mix(finalCol, hitCol, 0.88);
    finalCol += min(railHaze, 2.0) * mix(pal, vec3(0.80, 0.70, 1.00), 0.5) * 0.32;
    finalCol += min(gantryAcc, 1.4) * vec3(0.95, 0.84, 1.00) * 0.26 * (0.55 + 0.9 * audioKick);
    finalCol += railTint;

    finalCol = pow(max(finalCol, 0.0), vec3(0.88));
    // Highlight rolloff: more track light in the frame must not clip it white.
    float mx = max(finalCol.r, max(finalCol.g, finalCol.b));
    finalCol *= 1.0 / (1.0 + max(0.0, mx - 0.80));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
