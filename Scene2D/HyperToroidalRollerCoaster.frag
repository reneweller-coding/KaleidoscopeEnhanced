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

    float t = audioAdvance * 0.4 * spd;

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

    vec3 rd = normalize(uv.x * right + uv.y * up + (1.25 + 0.2 * sin(audioSwell * 2.0)) * T);

    // Raymarching through track tube
    float totDist = 0.0;
    float minTrackDist = 1e4;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * totDist;

        // Approximate distance to closest point on torus knot
        float uNear = atan(p.y, p.x) / 3.0;
        vec3 pTrack = torusKnotPoint(uNear, R, r);
        float dTrack = length(p - pTrack) - rW;
        minTrackDist = min(minTrackDist, dTrack);

        if (dTrack < 0.005 || totDist > 10.0) {
            vec2 sampleUV = fract(vec2(uNear * 0.5, p.z * 0.3));
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(uNear * 0.2 + t * 0.05);

            hitCol = mix(texCol, palCol, 0.5) * (0.7 + 0.4 * (1.0 - dTrack));
            break;
        }

        totDist += max(0.02, dTrack * 0.7);
    }

    // Glowing laser track rails & support rings
    float railGlow = exp(-minTrackDist * (24.0 + 12.0 * audioCentroid)) * glw;
    vec3 railTint = vec3(1.4, 1.1, 1.8) * railGlow * (1.0 + 2.5 * audioKick);

    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.2) * (0.2 + 0.15 * audioLevel);
    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += railTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
