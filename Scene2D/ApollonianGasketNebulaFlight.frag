#version 330 core
out vec4 fragColor;
/**
 * @file ApollonianGasketNebulaFlight.frag
 * @brief APOLLONIAN GASKET NEBULA FLIGHT: 3D Raymarching camera flight through
 * nested Apollonian sphere packing gasket voids immersed in glowing volumetric
 * cosmic nebula clouds with metallic reflections.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward 3D flight trajectory
 *   audioKick    -> flashes the void rim glow on rays that miss the packing
 *   audioCentroid-> modulates the sphere packing folding scale (`s` in the IFS)
 *   audioSubBass -> breathes the whole packing in and out (applied as a uniform
 *                   scale around the estimator, not inside the fold)
 *   audioLevel   -> nebula accumulation density
 *   audioHigh    -> star dust brightness
 *   audioSwell   -> field of view breathing and nebula/haze strength
 *   audioChromaHue-> steers the nebula & metallic reflection palette
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
uniform float densityP;
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

// Overall level of the photo currently on the texture units, from a fixed
// 5-tap grid. Every base colour here is photo-derived and the library spans
// near-black to near-white, so a bright photo left the additive rim/nebula
// terms no headroom at all. The probe rides the tex0/tex1 crossfade, so the
// gain it feeds can never pop, and because it is one number for the whole
// frame it rescales exposure without touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// The fold factor of the inversion IFS. Kept as its own function because the
// packing scale is now derived in one place: `scaleP` spans 0.7..1.4 in the
// preset, and only the TOP of that range produced a gasket at all -- below
// about s = 1.5 the spheres of one lattice cell swallow the camera and the
// whole frame is the inside of a single smooth ball (measured: occupancy 0.00,
// contrast 0.018). Remapped so the whole preset range lands in the band that
// renders nested packings, with audioCentroid riding on top -- s never
// multiplies `time`, so this is anti-flicker safe.
float foldScale(float scaleMod) {
    float u = clamp((scaleMod - 0.7) / 0.7, 0.0, 1.0);
    return 1.64 + 0.16 * u + 0.05 * audioCentroid;
}

// 3D Apollonian SPHERE PACKING distance estimator.
//
// This used to return `0.25 * abs(p.y) / scale`, the distance to the PLANE
// y = 0 in folded space. That estimator renders a foam whose gradient -- and
// therefore whose surface normal -- is +-Y almost everywhere: measured over
// 13k surface samples, |n.y| = 0.81 while |n.x| = |n.z| = 0.22. With the flight
// climbing +Y the camera only ever saw down-facing faces, every one of them
// turned away from the sun, so no lighting term could produce any light/dark
// separation at all and the frame collapsed to one value.
//
// `length(p) - 1.0` is the distance to the SPHERE of the folded cell, which is
// what the scene is named after in the first place, and its normal is
// isotropic (measured |n.x| = |n.y| = |n.z| = 0.50). The division by the
// accumulated fold factor is the usual IFS Lipschitz correction and the 0.25
// is the safety margin; the estimate is signed, so `abs()` at the call site
// keeps a camera that slips inside a shell marching back out.
// Sub-bass breathing, restored as a UNIFORM SCALE around the whole estimator
// rather than as a factor inside the fold. Evaluating map(p/b)*b is exactly the
// same surface scaled by b, so the Lipschitz bound is preserved by
// construction -- which is what the earlier breathing radius broke when it
// scaled the fold from within and pushed the estimate off its bound.
float mapApollonian(vec3 p, float s, out float orbitTrap) {
    float breath = 1.0 + 0.22 * audioSubBass;
    p /= breath;

    float scale = 1.0;
    orbitTrap = 1e5;

    for (int i = 0; i < 7; i++) {
        p = -1.0 + 2.0 * fract(0.5 * p + 0.5);

        float r2 = dot(p, p);
        orbitTrap = min(orbitTrap, r2);

        float k = clamp(s / max(r2, 1e-4), 0.15, 5.0);
        p *= k;
        scale *= k;
    }

    return 0.25 * (length(p) - 1.0) / scale * breath;
}

float mapD(vec3 p, float s) {
    float t;
    return mapApollonian(p, s, t);
}

vec3 calcNormal(vec3 p, float s) {
    // 1.8e-3 is a little under the hit epsilon: any smaller and the difference
    // drowns in the estimator's own noise, any larger and the shell edges of
    // the packing round off into mush.
    const vec2 e = vec2(1.8e-3, 0.0);
    return normalize(vec3(mapD(p + e.xyy, s) - mapD(p - e.xyy, s),
                          mapD(p + e.yxy, s) - mapD(p - e.yxy, s),
                          mapD(p + e.yyx, s) - mapD(p - e.yyx, s)));
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Far-field star dust, spread over the whole sphere of directions so the voids
// between gasket shells still carry content instead of reading as dead black.
float starField(vec3 rd) {
    vec2 sv = vec2(atan(rd.z, rd.x) * 1.5915494, rd.y * 1.1) * 30.0;
    vec2 gi = floor(sv);
    vec2 gf = fract(sv) - 0.5;
    float h = hash21(gi);
    float bright = smoothstep(0.80, 1.0, h);
    vec2 off = (vec2(hash21(gi + 3.17), hash21(gi + 7.71)) - 0.5) * 0.7;
    float dd = dot(gf - off, gf - off);
    return bright * exp(-dd * 70.0);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc = (scaleP > 0.01) ? scaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;
    float den = (densityP > 0.01) ? densityP : 1.0;

    // The flight advanced ONLY on audioAdvance, which creeps at about 0.25
    // units/s on quiet material -- the camera was effectively parked (measured
    // motion 0.0013, under the static threshold). A constant base rate keeps the
    // dive moving with audioAdvance still surging on top; `spd` is a
    // per-activation constant, so the coefficient on `time` is constant and this
    // stays anti-flicker safe.
    float t = time * 0.30 * spd + audioAdvance * 0.3 * spd;

    // Flight camera position weaving through Apollonian voids.
    // The old path climbed straight up +Y through a lattice whose period is 2,
    // so every ray terminated at almost the same depth (measured spread of
    // log(distance): 0.12, i.e. the entire frame sat on one wall). A DIAGONAL
    // course through the lattice never repeats its relation to the cells, and
    // the measured depth spread rises to ~0.9 -- which is where the picture's
    // sense of a hall of shells comes from.
    vec3 ro = vec3(
        sin(t * 0.33) * 1.2,
        t * 0.55,
        t * 0.55 + cos(t * 0.29) * 1.2
    );

    vec3 ta = ro + vec3(
        cos(t * 0.33) * 0.45,
        0.75,
        0.75 - sin(t * 0.29) * 0.45
    );

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(sin(t * 0.2) * 0.30, 1.0, cos(t * 0.2) * 0.30)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.2 + 0.2 * sin(audioSwell)) * ww);

    float s = foldScale(sc);

    // Raymarching through Apollonian fractal space
    float totDist = 0.02;
    float minD = 1e4;
    float trap = 0.0;
    float marched = 0.0;
    vec3 hitCol = vec3(0.0);
    float nebulaAcc = 0.0;
    bool  hit = false;

    for (int i = 0; i < 120; i++) {
        vec3 p = ro + rd * totDist;
        float curTrap;
        float d = mapApollonian(p, s, curTrap);
        float ad = abs(d);
        minD = min(minD, ad);
        marched = float(i);

        // Volumetric nebula accumulation in the voids
        nebulaAcc += exp(-ad * 14.0) * (0.010 + 0.012 * audioLevel) * den;

        // The hit epsilon used to be 0.0015 * (1 + totDist) against a minimum
        // step of 0.012 -- eight times coarser than the tolerance. Rays
        // therefore stopped in MID-AIR, wherever the estimator's noise happened
        // to dip, and the "surface" normal taken there was garbage (measured
        // diffuse response 0.010 with a spread of 0.056: no shading at all).
        // A tolerance that stays under the step size makes the march actually
        // land on the shell; the diffuse response rises to 0.28 with a spread
        // of 0.35, which is the light/dark separation the picture was missing.
        if (ad < 0.0009 * (1.0 + 0.3 * totDist)) {
            trap = curTrap;
            hit  = true;
            break;
        }

        totDist += max(0.004, ad * 0.85);
        if (totDist > 12.0) break;
    }
    nebulaAcc = min(nebulaAcc, 1.1);

    // One global exposure gain taken from the photo on the texture units. Hit
    // faces, nebula, haze and stars are ALL photo-derived, so a bright photo
    // pushed the whole frame to a near-white wash with no room left for the
    // rim glow. Scaling them together preserves local contrast; it only moves
    // the exposure the gasket is lit at.
    float expGain = clamp(0.24 / max(0.05, photoLevel()), 0.24, 2.4);

    if (hit) {
        // The hit used to be coloured by a bare photo lookup with NO lighting
        // term of any kind -- no normal, no light, no occlusion -- so a shell
        // that filled the frame filled it with one colour. Everything below is
        // the missing shading.
        vec3 p = ro + rd * totDist;
        vec3 nor = calcNormal(p, s);

        // How long the ray had to grope before it landed stands in for ambient
        // occlusion: a shell reached in three steps is out in the open, one
        // reached in ninety is down a crevice.
        float ao = clamp(1.0 - marched / 110.0, 0.14, 1.0);

        vec3 lig = normalize(vec3(0.42, 0.80, -0.43));
        float dif = clamp(dot(nor, lig), 0.0, 1.0);
        float bac = clamp(dot(nor, -lig), 0.0, 1.0) * 0.16;
        // A headlight carries the key: inside a packing the sun is behind the
        // shell you are looking at more often than not, and the isotropic
        // normal makes dot(n, -rd) sweep the full 0..1 across a single shell.
        float hdl = clamp(dot(nor, -rd), 0.0, 1.0);
        float fre = 1.0 - hdl; fre = fre * fre * fre;
        vec3  hlf = normalize(lig - rd);
        float spe = pow(clamp(dot(nor, hlf), 0.0, 1.0), 20.0);

        vec2 sampleUV = fract(p.xz * 0.25 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 pal = imgPalette(trap * 2.0 + t * 0.1);
        vec3 base = mix(texCol, pal, 0.55) * expGain * 0.66;

        // Two structure terms. The orbit trap bands the shells by which sphere
        // of the packing they belong to; the world-space grain keeps even a
        // shell that fills the whole frame from reading as one flat card. The
        // grain is static in WORLD space -- the camera moving through it is
        // what animates it, so no audio value ever reaches `time`.
        float band = 0.62 + 0.38 * sin(trap * 22.0 + t * 0.40);
        float det  = 0.58 + 0.42 * sin(p.x * 26.0) * sin(p.y * 26.0 + 1.7)
                                 * sin(p.z * 26.0 + 3.1);

        float shade = (0.05 + 1.00 * hdl * ao + 0.60 * dif * ao + bac) * band * det;
        hitCol = base * shade + pal * (spe * ao * 0.45) + pal * (fre * ao * 0.20);
    }

    // Glowing rims around the VOIDS. This term is a function of how close the
    // ray passed to a shell -- which for a ray that HITS one is, by definition,
    // zero. It was applied unconditionally, so exp(-minD * 30) came out at
    // ~0.95 on every pixel of the frame, the vec3 cap below turned that into a
    // flat vec3(0.80), and +0.64 of uniform grey was painted over the whole
    // picture (measured: it alone accounted for luma 0.65 at contrast 0.018).
    // Capping the tinted vector is still right -- vec3(1.2,1.0,1.6) exceeds 1.0
    // per channel on its own -- but the term only means anything on a MISS.
    float edgeGlow = hit ? 0.0
                         : min(exp(-minD * 55.0) * glw, 1.4);
    vec3 glowTint = min(vec3(1.2, 1.0, 1.6) * edgeGlow * (1.0 + 2.0 * audioKick), vec3(0.55));

    // Volumetric cosmic nebula fog
    vec3 nebulaCol = imgPalette(0.35 + sin(t * 0.2) * 0.2) * expGain * nebulaAcc * (1.0 + 0.7 * audioSwell);

    // ---- far field: a bounded haze + star dust so the voids are atmosphere, not nothing
    float hz = 0.5 + 0.5 * sin(rd.x * 3.7 + t * 0.11) * sin(rd.y * 3.1 - t * 0.09)
                       * sin(rd.z * 2.3 + t * 0.07);
    vec3 haze = imgPalette(0.62 + 0.15 * hz) * expGain * (0.030 + 0.060 * hz) * (0.7 + 0.5 * audioSwell);
    vec3 stars = imgPalette(0.18) * expGain * starField(rd) * (0.35 + 0.35 * audioHigh);
    vec3 farField = min(haze + stars, vec3(0.45));

    // Composite on the actual hit flag, not on length(hitCol): once the base
    // is held down to a dark exposure a legitimately dark gasket face has a
    // short colour vector, and the old length() mask silently faded those
    // faces back into the nebula.
    vec3 finalCol = mix(nebulaCol + farField, hitCol, hit ? 1.0 : 0.0);
    finalCol += glowTint * 0.8 + nebulaCol * 0.30;

    // Atmospheric depth fog. Held well back from the old 0.14/0.8: the fog
    // colour is a single flat value, so a strong mix is itself a frame-wide
    // flattener, and the shading above now carries the depth cue anyway.
    float fog = 1.0 - exp(-totDist * 0.16);
    finalCol = mix(finalCol, imgPalette(0.7) * expGain * 0.18 + farField * 0.6, fog * 0.55);

    finalCol = pow(finalCol, vec3(0.88));
    vec3 _catTone = clamp(finalCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
