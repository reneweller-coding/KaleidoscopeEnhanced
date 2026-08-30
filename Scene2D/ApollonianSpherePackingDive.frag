#version 330 core
out vec4 fragColor;
/**
 * @file ApollonianSpherePackingDive.frag
 * @brief APOLLONIAN SPHERE PACKING DIVE: 3D Raymarching continuous dive into the voids
 * of an Apollonian sphere packing (mutually tangent Soddy spheres). Endless recursive
 * sphere inversions, glowing circular contact laser rings, and infinite depth reflection.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward dive into tangent sphere voids
 *   audioKick    -> flashes sphere contact tangency nodes & triggers inversion burst
 *   audioCentroid-> sharpens spherical laser contact ring contours
 *   audioSubBass -> expands Soddy sphere radii breathing
 *   audioChromaHue-> rotates the luminous Apollonian gemstone spectrum
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
uniform float scaleP;
uniform float foldP;
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

// Overall level of the photo on the texture units (fixed 5-tap grid, rides
// the tex0/tex1 crossfade so it can never pop). The hit colour is half
// photo, and since the edge-corridor course (see main) keeps a lit wall in
// front of the lens the whole time, a bright photo pushed the frame to a
// luma of 115-145 on a scene tagged "dark". One frame-wide gain rescales
// the exposure without touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// Soft-max, used to carve a smooth clearance bubble around the camera out
// of the distance field: the flight can never clip through geometry -- a
// would-be collision becomes a soft bulge sliding past the lens.
float smax(float a, float b, float k) {
    float h = clamp(0.5 - 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(a, b, h) + k * h * (1.0 - h);
}

// Apollonian sphere-packing distance estimator (classic Knighty form).
// The previous version clamped the inversion Mandelbox-style; the clamp is
// exactly what shredded the foam into box-shaped chips ("eckig"). The true
// packing needs the UNCONDITIONAL inversion k = K/r2 -- scale explosion is
// tamed by dividing the estimate by the accumulated scale, and the r2 guard
// keeps the fold finite at the fixed point.
float mapApollonian(vec3 p, float K, out float trapLevel) {
    float scale = 1.0;
    trapLevel = 0.0;
    for (int i = 0; i < 7; i++) {
        p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
        float r2 = max(dot(p, p), 1e-4);
        float k = K / r2;
        p *= k;
        scale *= k;
        trapLevel += r2 * 0.12;
    }
    return 0.25 * abs(p.y) / scale;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc = (scaleP > 0.01) ? scaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // Steady base rate from `time` plus the pre-integrated audio advance, the
    // same split the rest of the Scene2D family uses. `spd` is a per-activation
    // constant, never an audio value, so this stays anti-flicker safe. Without
    // the `time` term the whole dive was driven by audioAdvance alone, which
    // barely moves on quiet material -- the scene sat frozen on one frame.
    float t = time * 0.30 * spd + audioAdvance * 0.28 * spd;

    // Continuous dive trajectory through sphere gaps. `scaleP` sets the packing
    // density via the Soddy radius rather than scaling the camera position:
    // scaling the position only slid the camera around inside the periodic
    // lattice, and at the top of the range it parked in a sparse cell where
    // barely a third of the frame found any structure.
    // K sets the packing character (1.05..1.30 is the pretty band); sub-bass
    // breathes it very gently -- K shifts sphere sizes, not the camera.
    float sphR = (1.08 + 0.10 * sc) * (1.0 + 0.02 * audioSubBass);

    float diveProg = t * 0.6;
    // The dive runs along a CELL EDGE of the period-2 lattice, not through
    // the cell interior. The old course, sin/cos weaving +-0.4 around the
    // z axis, was measured (NumPy port of mapApollonian, 12k samples along
    // the path) to sit INSIDE solid 18-20 % of the time and within 0.15 of a
    // surface 40 % of the time -- so the clearance bubble was engaged almost
    // permanently, and whenever the camera went fully solid the frame was
    // nothing but the bubble's own inside (a flat disc of concentric rings
    // for one frame, then the foam snapped back): a "camera jump" with a
    // perfectly continuous `ro`. The distance field is open along the
    // planes x = odd and y = odd -- a cross-shaped corridor whose spine, the
    // edge line x = y = 1, has a clearance of 1.0 or more for every sphere
    // radius the preset can produce. The weave stays in the x > 1, y > 1
    // quadrant on purpose: the opposite quadrant is solid around z = 0.5
    // mod 2, and a symmetric +-0.2 weave about the edge already dipped to
    // -0.8. Worst case along this course is 0.58 (sphR 1.44, sub-bass
    // fully up), comfortably outside the 0.40 bubble.
    vec3 ro = vec3(1.25 + 0.25 * sin(diveProg * 0.3),
                   1.15 + 0.15 * cos(diveProg * 0.25),
                   diveProg * 1.5);
    vec3 rd = normalize(vec3(uv, 1.25 + 0.2 * sin(audioSwell * 2.0)));

    float expGain = clamp(0.22 / max(0.05, photoLevel()), 0.3, 1.4);

    // Raymarching through Apollonian sphere packing
    float totDist = 0.0;
    float minD = 1e4;
    float hitTrap = 0.0;
    vec3 hitCol = vec3(0.0);
    bool hit = false;

    for (int i = 0; i < 52; i++) {
        vec3 p = ro + rd * totDist;
        float curTrap;
        float d = mapApollonian(p, sphR, curTrap);
        d = smax(d, 0.40 - length(p - ro), 0.15);   // camera clearance bubble

        // minD drives the contact-ring glow, so it has to be a PER-PIXEL
        // signal. Sampling it at i == 0 samples the shared camera position,
        // which is the same point for every pixel on the screen: whenever the
        // camera drifts near a surface, minD becomes a frame-wide CONSTANT and
        // the glow floods the entire frame with one flat colour. Skip the
        // camera sample. Hit pixels are excluded below for the same reason --
        // minD is ~0 by construction on any ray that converged, so it carries
        // no edge information there, only a white-out.
        // Track the halo distance only past the camera's own clearance
        // bubble -- tracking it from step one painted a giant soft disc of
        // bubble-glow over the middle of every frame.
        if (totDist > 0.8) minD = min(minD, abs(d));

        // The old min step of 0.015 was five times the 0.003 hit threshold, so
        // a ray closing on a surface jumped clean over the convergence band.
        if (abs(d) < 0.004) {
            hit = true;
            hitTrap = curTrap;
            break;
        }
        // Far termination is a MISS: painting it as a photo-textured hit was
        // what filled the frame with hard rectangular chips (fract() seams on
        // a flat far wall).
        if (totDist > 8.0) break;

        totDist += max(0.002, d * 0.7);
    }

    // Surface shading with a REAL normal: without one every facet was a flat
    // unlit patch and nothing on screen read as a sphere.
    vec3 hitCol2 = vec3(0.0);
    if (hit) {
        vec3 p = ro + rd * totDist;
        float tl;
        vec2 e = vec2(0.006, 0.0);
        vec3 n = normalize(vec3(
            mapApollonian(p + e.xyy, sphR, tl) - mapApollonian(p - e.xyy, sphR, tl),
            mapApollonian(p + e.yxy, sphR, tl) - mapApollonian(p - e.yxy, sphR, tl),
            mapApollonian(p + e.yyx, sphR, tl) - mapApollonian(p - e.yyx, sphR, tl)));
        vec3 lightDir = normalize(vec3(0.5, 0.7, -0.4));
        float dif  = max(dot(n, lightDir), 0.0);
        vec3 hv    = normalize(lightDir - rd);
        float spec = pow(max(dot(n, hv), 0.0), 24.0);
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        // Photo colour through the NORMAL (seam-free), palette from the trap.
        vec3 base = mix(imgPalette(hitTrap * 0.25 + t * 0.05),
                        img(n.xy * 0.25 + 0.5), 0.35);
        float fog = exp(-totDist * 0.28);
        hitCol2 = (base * (0.38 + 1.05 * dif)
                 + vec3(1.0) * spec * 0.6
                 + imgPalette(0.7) * fres * 0.45)
                * (0.25 + 0.85 * fog) * expGain;
    }
    hitCol = hitCol2;

    // Glowing spherical tangency contact rings -- silhouette haloes on the
    // rays that MISSED, which is the only place a closest-approach distance
    // means anything.
    // Steep falloff: at 26 the halo was a frame-flooding white field; at ~110
    // it is the thin bright tangency line the name promises.
    float contactGlow = hit ? 0.0 : exp(-minD * (110.0 + 40.0 * audioCentroid)) * glw * 0.8;
    vec3 glowTint = vec3(1.3, 1.1, 1.8) * contactGlow * (1.0 + 2.5 * audioKick);

    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.2) * (0.10 + 0.08 * audioLevel) * expGain;
    // Composite on the hit flag, not on length(hitCol): with the exposure
    // gain holding a bright photo down, a legitimately dark wall has a short
    // colour vector and the old length() mask faded it into the background.
    vec3 finalCol = mix(bgCol, hitCol, hit ? 1.0 : 0.0);
    finalCol += glowTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
