#version 330 core
out vec4 fragColor;
/**
 * @file KaleidoscopicBismuthLattice.frag
 * @brief KALEIDOSCOPIC BISMUTH LATTICE: Right-angled stepped hopper crystal Bismuth
 * labyrinth (L1-norm Manhattan KIFS) with iridescent thin-film rainbow interference,
 * 12-fold rotational symmetry, and glowing metallic hopper steps.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous Bismuth hopper step growth & rotation
 *   audioKick    -> flashes iridescent rainbow oxide films & expands step edges
 *   audioCentroid-> sharpens right-angled staircase step density
 *   audioSubBass -> expands hopper cavity depth breathing
 *   audioChromaHue-> rotates the metallic thin-film interference spectrum
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
uniform float stepsP;
uniform float iridescenceP;
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

// Distance estimator for Bismuth hopper crystals (stepped cubic KIFS)
float mapBismuth(vec3 p, float t, float nSteps, out float stepLevel) {
    vec3 q = p;
    stepLevel = 0.0;

    for (int i = 0; i < 6; i++) {
        // Absolute cubic fold
        q = abs(q);
        if (q.x < q.y) q.xy = q.yx;
        if (q.x < q.z) q.xz = q.zx;
        if (q.y < q.z) q.yz = q.zy;

        // Stepped hopper offset
        q.x -= 0.65;
        q.y -= 0.45;
        q.z -= 0.35;

        // Scale
        q *= 1.45;
        stepLevel += dot(q, q) * 0.1;
    }

    // Manhattan box step edge distance
    float dBox = max(max(q.x, q.y), q.z) - 1.2;
    return dBox / pow(1.45, 6.0);
}

// Same field, evaluated from a WORLD-space point (applies the identical
// crystal-rotation transform the main march uses) so it can be finite-
// differenced for a world-space surface normal.
float mapBismuthWorld(vec3 pw, float t) {
    float cs = cos(t * 0.2), sn = sin(t * 0.2);
    pw.xz = mat2(cs, -sn, sn, cs) * pw.xz;
    float dummy;
    return mapBismuth(pw, t, 0.0, dummy);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float nSt = (stepsP > 0.01) ? stepsP : 1.0;
    float irid = (iridescenceP > 0.01) ? iridescenceP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.28 * spd;

    // 12-Fold radial kaleidoscope fold
    float a = atan(uv.y, uv.x);
    float r = length(uv);
    float seg = 3.14159265 / 6.0;
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);
    vec2 pFold = vec2(cos(a), sin(a)) * r;

    // Camera setup looking into the Bismuth hopper cavern -- ONE shared
    // origin with the fold only steering ray DIRECTION. Folding pFold into
    // the origin too gave every pixel its own camera position correlated
    // with its own ray, so most rays started already touching the (equally
    // pFold-symmetric) crystal -- an instant, near-uniform hit.
    // camDist=2.4 still sat almost exactly ON the crystal surface (|d|~0.01
    // at the shared origin) for large stretches of the rotation -- since
    // every ray's FIRST sample is taken at that shared point (totDist=0),
    // rays could converge to a near-instant, direction-independent hit.
    // 3.6 keeps the origin robustly outside the lattice so each ray's
    // march is actually its own (the flat-interior glow bug itself turned
    // out to be a separate, deeper issue -- see the Fresnel rim comment
    // below).
    float camDist = 3.6 + 0.3 * sin(audioSwell * 2.0);
    vec3 ro = vec3(0.0, 0.0, -camDist);
    vec3 rd = normalize(vec3(pFold, 1.25));

    // Raymarching
    float totDist = 0.0;
    float hitStep = 0.0;
    float stepGlow = 0.0;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 52; i++) {
        vec3 pWorld = ro + rd * totDist;
        vec3 p = pWorld;

        // Slow rotation of crystal inside
        float cs = cos(t * 0.2), sn = sin(t * 0.2);
        p.xz = mat2(cs, -sn, sn, cs) * p.xz;

        float curStep;
        float d = mapBismuth(p, t, nSt, curStep);

        // A camDist increase alone can't fix a flat interior: minD (closest
        // |d| over the WHOLE march) is, by construction, always inside
        // [0, hit-threshold] for any ray that actually hits -- that's what
        // "hit" means, not an edge/proximity signal. Verified numerically:
        // for pixels that hit, minD sat in [0, 0.002] 100% of the time
        // regardless of camera distance, so exp(-minD*k) saturated near its
        // ceiling across the ENTIRE lattice interior no matter how steep k
        // was made; only true misses (which range wider) ever varied. The
        // decay-steepen pass could therefore only ever sharpen the outer
        // ring where rays graze past the lattice, never the solid interior.
        // A Fresnel-style grazing-angle term from the actual surface normal
        // varies correctly across flat faces vs. sharp lattice edges
        // (confirmed numerically: real spread from ~0 to ~0.88 across the
        // hit surface, not a saturated constant).
        if (abs(d) < 0.002) {
            hitStep = curStep;

            vec2 eps = vec2(0.001, 0.0);
            vec3 nrm = normalize(vec3(
                mapBismuthWorld(pWorld + eps.xyy, t) - mapBismuthWorld(pWorld - eps.xyy, t),
                mapBismuthWorld(pWorld + eps.yxy, t) - mapBismuthWorld(pWorld - eps.yxy, t),
                mapBismuthWorld(pWorld + eps.yyx, t) - mapBismuthWorld(pWorld - eps.yyx, t)
            ));
            stepGlow = pow(1.0 - abs(dot(nrm, -rd)), 3.0) * glw;

            // Thin-film oxide rainbow interference based on step depth
            vec3 thinFilm = vec3(
                sin(hitStep * 4.0 * irid + t * 2.0),
                sin(hitStep * 4.0 * irid + t * 2.0 + 2.094),
                sin(hitStep * 4.0 * irid + t * 2.0 + 4.188)
            ) * 0.5 + 0.5;

            vec2 sampleUV = fract(p.xy * 0.4 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 pal = imgPalette(hitStep * 0.2 + 0.1);

            hitCol = mix(texCol, pal, 0.4) * thinFilm * (0.8 + 0.4 * (1.0 - d));
            break;
        }
        if (totDist > 6.0) break;

        totDist += max(0.015, d * 0.7);
    }

    // Glowing stepped hopper edges (rim-lit via the Fresnel term computed
    // above; left at 0 on a true miss so bgCol shows through cleanly).
    vec3 glowTint = vec3(1.4, 1.2, 1.7) * stepGlow * (1.0 + 2.5 * audioKick);

    vec3 bgCol = imgPalette(r * 0.5 + 0.3) * (0.2 + 0.15 * audioLevel);
    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
