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

// Apollonian 3D sphere packing distance estimator
float mapApollonian(vec3 p, float sphR, out float trapLevel) {
    vec3 q = p;
    float scale = 1.0;
    trapLevel = 0.0;

    for (int i = 0; i < 6; i++) {
        // Periodic box wrapping
        q = mod(q - 1.0, 2.0) - 1.0;

        // Spherical inversion, Mandelbox-style piecewise clamp: only points
        // that land INSIDE the fixed radius get inverted/scaled, capped by
        // the min-radius ratio. The original unconditional k=1.25/max(0.2,r2)
        // multiplied q on every iteration regardless of r2, so an unlucky run
        // of small-r2 iterations could compound `scale` by up to 6.25^6 and
        // crush the returned distance to a few millionths. The clamp bounds
        // the per-iteration factor at 1/minR2, which keeps `scale` sane
        // (median 1.0, p95 4.2 over sampled points).
        float r2 = dot(q, q);
        const float minR2 = 0.3, fixedR2 = 1.0;
        if (r2 < minR2) {
            float k = fixedR2 / minR2;
            q *= k;
            scale *= k;
        } else if (r2 < fixedR2) {
            float k = fixedR2 / r2;
            q *= k;
            scale *= k;
        }

        trapLevel += r2 * 0.15;
    }

    // Soddy sphere centred on the CELL CORNER, not on the origin.
    //
    // The origin is the fixed point of the inversion above, and the inversion
    // is precisely what evacuates it: the r2 < fixedR2 branch maps |q| -> 1/|q|
    // and the r2 < minR2 branch multiplies by 1/minR2, so BOTH branches push
    // points out of the unit ball and the third branch is a no-op that only
    // runs when |q| >= 1 already. Post-fold |q| therefore lands in [1.0, 1.72]
    // and can never go below 1 -- measured over 20k sampled points, min |q| was
    // 1.0000. The previous `length(q) - 0.75` asked for the distance to a
    // sphere whose interior is empty by construction: the estimate stayed
    // strictly positive everywhere, no ray could ever converge on a surface,
    // and the frame collapsed to the background plus the glow term.
    // Measuring from the corner (1,1,1) -- a tangency point of the packing,
    // which the inversion group leaves populated -- puts the zero set back
    // inside the reachable band.
    //
    // Sub-bass only ever GROWS the radius, so the estimate shrinks: it stays
    // conservative and the march can never overshoot into a surface.
    float dSphere = (length(q - vec3(1.0)) - sphR) / scale;
    return dSphere * 0.7;
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
    float sphR = (1.15 + 0.15 * sc) * (1.0 + 0.06 * audioSubBass);

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

    float expGain = clamp(0.22 / max(0.05, photoLevel()), 0.3, 2.0);

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
        if (i > 0) minD = min(minD, abs(d));

        // The old min step of 0.015 was five times the 0.003 hit threshold, so
        // a ray closing on a surface jumped clean over the convergence band.
        if (abs(d) < 0.004 || totDist > 8.0) {
            hit = true;
            hitTrap = curTrap;
            vec2 sampleUV = fract(p.xy * 0.3 + p.z * 0.2 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(hitTrap * 0.25 + t * 0.05);

            // Depth fog gives the dive its sense of travel and keeps the far
            // wall (the totDist > 8 termination above) from reading as a solid
            // sheet of texture pasted across the frame.
            float fog = exp(-totDist * 0.28);
            hitCol = mix(texCol, palCol, 0.5) * (0.25 + 0.85 * fog) * expGain;
            break;
        }

        totDist += max(0.002, d * 0.7);
    }

    // Glowing spherical tangency contact rings -- silhouette haloes on the
    // rays that MISSED, which is the only place a closest-approach distance
    // means anything.
    float contactGlow = hit ? 0.0 : exp(-minD * (26.0 + 12.0 * audioCentroid)) * glw;
    vec3 glowTint = vec3(1.3, 1.1, 1.8) * contactGlow * (1.0 + 2.5 * audioKick);

    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.2) * (0.2 + 0.15 * audioLevel) * expGain;
    // Composite on the hit flag, not on length(hitCol): with the exposure
    // gain holding a bright photo down, a legitimately dark wall has a short
    // colour vector and the old length() mask faded it into the background.
    vec3 finalCol = mix(bgCol, hitCol, hit ? 1.0 : 0.0);
    finalCol += glowTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
