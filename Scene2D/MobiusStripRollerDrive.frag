#version 330 core
out vec4 fragColor;
/**
 * @file MobiusStripRollerDrive.frag
 * @brief MOBIUS STRIP ROLLER DRIVE: High-velocity 3D roller coaster ride along a
 * twisted single-sided Möbius strip. Seamless continuous surface traversal with
 * periodic complementary color inversions, laser track rails, and neon sparks.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward roller-coaster velocity along the strip
 *   audioKick    -> flashes track neon energy nodes & triggers orientation flip burst
 *   audioCentroid-> sharpens laser rail line resolution & track sparks
 *   audioSubBass -> expands strip width breathing amplitude
 *   audioChromaHue-> steers the continuous non-orientable rainbow palette
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
uniform float stripWidthP;
uniform float radiusP;
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

// Parametric Möbius Strip surface point: r(u, v)
vec3 mobiusPoint(float u, float v, float rBase, float w) {
    float uHalf = u * 0.5;
    float rad = rBase + v * w * cos(uHalf);
    return vec3(rad * cos(u), rad * sin(u), v * w * sin(uHalf));
}

// Signed distance to the Möbius RIBBON.
//
// The march used to measure distance to mobiusPoint(u, v = 0), but BOTH the
// width term and the twist term carry a factor of v, so at v = 0 they vanish
// identically and mobiusPoint collapses to (rB*cos u, rB*sin u, 0) -- a plain
// flat circle. What got raymarched was therefore a thin torus around that
// circle, with no width and no half-twist: `stripWidthP` provably could not
// affect a single pixel (the hit mask was bit-identical for stripWidthP 0.4 /
// 0.65 / 0.9), and because a torus is rotationally symmetric about z while the
// camera frame was built from the track itself, flying along the track just
// rotated the whole configuration onto itself -- the image was very nearly
// INVARIANT, which is why a "roller drive" barely moved.
//
// So build the real surface instead. At angle u the ribbon is a segment of
// half-width halfW through the centre circle, rotated by u/2 in the local
// (radial, z) plane.
float mobiusSDF(vec3 p, float rB, float halfW, float thick,
                out float along, out float uOut) {
    float u  = atan(p.y, p.x);
    float rr = length(p.xy) - rB;   // radial offset from the centre circle
    float zz = p.z;
    float c  = cos(u * 0.5), s = sin(u * 0.5);

    along       =  rr * c + zz * s; // coordinate across the ribbon's width
    float across = -rr * s + zz * c; // signed offset off the ribbon's face
    uOut = u;

    // abs(along) is what makes this single-valued -- and what makes it a
    // Möbius strip rather than a cylinder. Going once around (u -> u + 2pi)
    // advances u/2 by pi and so FLIPS the width axis; the segment is symmetric
    // about its centre, so the flipped segment coincides with itself and the
    // half-twist closes up seamlessly. It also keeps the estimate continuous
    // across the atan() branch cut at u = +-pi, where c and s change sign.
    vec2 q = vec2(max(abs(along) - halfW, 0.0), across);
    return (length(q) - thick) * 0.6;   // 0.6: Lipschitz safety for the twist
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rB = (radiusP > 0.01) ? radiusP : 2.2;
    float sW = (stripWidthP > 0.01) ? stripWidthP : 0.65;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // Steady base rate from `time` plus the pre-integrated audio advance, the
    // same split the rest of the Scene2D family uses. `spd` is a per-activation
    // constant, never an audio value, so this stays anti-flicker safe. Driving
    // the ride from audioAdvance alone swept uCam through barely a fifth of a
    // radian over a whole quiet probe -- a crawl, not a roller drive.
    float t = time * 0.30 * spd + audioAdvance * 0.35 * spd;

    // Track progression parameter u
    float uCam = t * 0.6;

    // Local ribbon frame on the centre circle: T runs along the track and N is
    // the ribbon's face normal, tilting with uCam/2 -- the half-twist. (The
    // strip's width axis falls out as `right` below, since cross(T, N) is
    // exactly it.)
    float ch = cos(uCam * 0.5), sh = sin(uCam * 0.5);
    vec3 trackPos = vec3(rB * cos(uCam), rB * sin(uCam), 0.0);
    vec3 T        = vec3(-sin(uCam), cos(uCam), 0.0);
    vec3 N        = vec3(-cos(uCam) * sh, -sin(uCam) * sh, ch);

    // Strip width breathes with sub-bass. Note the camera clearance below is
    // measured along N, perpendicular to the face, so widening the ribbon
    // cannot pull the surface toward the camera.
    float halfW = sW * (1.0 + 0.25 * audioSubBass);
    const float thick = 0.035;

    // Chase-cam: ride ABOVE the ribbon's face and look ALONG the tangent, so
    // the strip recedes into the distance as a ribbon. Riding the centreline
    // itself put the camera ON the surface being marched, so the very first
    // step trivially hit for every pixel; the earlier lateral nudge of 0.35
    // only grazed a 0.06-radius tube and still filled half the frustum with
    // the inside face. Clearance here is camH - thick >= 0.59 for every
    // stripWidthP in range -- well clear of the surface, and two orders of
    // magnitude inside the march's 12.0 distance budget, so the offset can
    // never overshoot the far plane and blank the scene.
    float camH = 0.35 + 0.70 * sW;
    vec3 ro    = trackPos + N * camH;

    vec3 fwd   = normalize(T - N * 0.20);   // slight downward tilt onto the strip
    vec3 right = normalize(cross(fwd, N));
    vec3 up    = cross(right, fwd);

    vec3 rd = normalize(uv.x * right + uv.y * up + (1.25 + 0.2 * sin(audioSwell * 2.0)) * fwd);

    // Raymarching through Möbius strip ribbon
    float totDist = 0.0;
    float minTrackDist = 1e4;
    vec3 hitCol = vec3(0.0);
    bool hit = false;

    for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * totDist;

        float along, uRaw;
        float dRibbon = mobiusSDF(p, rB, halfW, thick, along, uRaw);

        // abs(), and never the camera sample at i == 0. minTrackDist was
        // min'd over the SIGNED distance, so any ray that crossed into the
        // ribbon drove it negative and exp(-negative * 36) blew the glow past
        // 1.0 -- that was the near-white wedge. And a closest-approach
        // distance is ~0 by construction on every ray that hit, so it is only
        // a meaningful signal on rays that MISSED (see the hit test below).
        if (i > 0) minTrackDist = min(minTrackDist, abs(dRibbon));

        if (dRibbon < 0.004) {
            hit = true;
            // Orientation flip determination (after one 2pi revolution, side is inverted)
            float cycle = floor(uCam / 6.2831853);
            bool inverted = (mod(cycle, 2.0) == 1.0);

            float uWrap = mod(uRaw, 6.2831853);
            // Texture runs ALONG the track and ACROSS the strip's width, so the
            // photo now actually wraps the ribbon instead of being sliced by a
            // world-space z plane.
            vec2 sampleUV = fract(vec2(uWrap / 6.2831853 * 2.0,
                                       along / (2.0 * halfW) + 0.5));
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(uWrap / 6.2831853 + (inverted ? 0.5 : 0.0));

            // Depth fog: without it the strip reads as one evenly lit slab
            // rather than a ribbon running away from the camera.
            float fog = exp(-totDist * 0.16);
            hitCol = mix(texCol, palCol, 0.5) * (0.20 + 0.95 * fog);
            break;
        }

        // Far plane: fall through to the background, rather than shading the
        // miss with ribbon texture as if it were a hit.
        if (totDist > 12.0) break;

        totDist += max(0.004, dRibbon * 0.8);
    }

    // Glowing laser track rails -- silhouette haloes along the strip's edges,
    // on the rays that missed it.
    float railGlow = hit ? 0.0 : exp(-max(minTrackDist, 0.0) * (24.0 + 12.0 * audioCentroid)) * glw;
    vec3 railTint = vec3(1.3, 1.1, 1.8) * railGlow * (1.0 + 2.5 * audioKick);

    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.2) * (0.2 + 0.15 * audioLevel);
    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += railTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
