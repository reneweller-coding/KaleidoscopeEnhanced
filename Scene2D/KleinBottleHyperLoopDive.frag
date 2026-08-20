#version 330 core
out vec4 fragColor;
/**
 * @file KleinBottleHyperLoopDive.frag
 * @brief KLEIN BOTTLE HYPER LOOP DIVE: 3D Raymarching plunge through a self-intersecting
 * 4D Klein Bottle immersion. Seamless flight from exterior space into interior
 * space without crossing an edge, with inverting normal colors and portal flash pulses.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward plunge along the Klein loop
 *   audioKick    -> flashes self-intersection singularity & topology inversion
 *   audioCentroid-> modulates Klein bottle surface ribbing resolution
 *   audioSubBass -> expands bottle neck diameter breathing
 *   audioChromaHue-> steers the non-orientable surface rainbow palette
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
uniform float radiusP;
uniform float twistP;
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

// Overall level of the photo currently bound, from a fixed 5-tap grid. Every
// colour in this scene -- surface, background haze, palette -- is
// photo-derived and the library spans near-black to near-white, which is what
// dropped this dive to a near-black frame. The probe rides the tex0/tex1
// crossfade so the gain can never pop, and one number for the whole frame
// rescales exposure without touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// Distance estimator for Figure-8 Klein Bottle immersion in 3D
float mapKlein(vec3 p, float t, float rBase, out float uCoord) {
    float r = length(p.xy);
    float a = atan(p.y, p.x);
    uCoord = a;

    // Figure-8 cross section: r(v) = (rBase + cos(u/2)*sin(v) - sin(u/2)*sin(2v))
    float uHalf = a * 0.5 + t * 0.4;
    float v = atan(p.z, r - rBase);

    // Sub-bass swells the base cross-section, i.e. the neck the camera flies
    // through; only the constant term is scaled so the figure-8 lobes keep
    // their shape and crossSecR can never approach 0 (min stays ~0.35).
    float crossSecR = 0.65 * (1.0 + 0.3 * audioSubBass) + 0.25 * cos(uHalf) * sin(v) - 0.25 * sin(uHalf) * sin(2.0 * v);
    float d = length(vec2(r - rBase, p.z)) - crossSecR;

    return d * 0.65;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rB = (radiusP > 0.01) ? radiusP : 1.8;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Camera ride coordinate inside the Klein bottle tube
    float aCam = t * 0.5;
    vec3 ro = vec3(cos(aCam) * rB, sin(aCam) * rB, 0.3 * sin(aCam * 2.0));
    vec3 ta = vec3(cos(aCam + 0.1) * rB, sin(aCam + 0.1) * rB, 0.3 * sin((aCam + 0.1) * 2.0));

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 0.0, 1.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.25 + 0.2 * sin(audioSwell * 2.0)) * ww);

    // Raymarching through Klein bottle
    float totDist = 0.0;
    float hitU = 0.0;
    vec3 hitP = ro;
    bool hit = false;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * totDist;
        float curU;
        float d = mapKlein(p, t, rB, curU);
        float ad = abs(d);

        // The camera rides INSIDE the tube, where the estimator is negative.
        // Sphere-tracing the SIGNED value pinned every step at the old 0.015
        // floor and the 0.003 hit window was narrower than the distance one
        // such step covers, so rays walked straight through the wall: all but
        // a small central disc fell out of the loop with hitCol still black,
        // and the frame collapsed to the dim background ring pattern. March
        // on |d| -- inside the tube that IS the distance to the wall -- with a
        // window wide enough that a step can no longer jump over it.
        if (ad < 0.008 + totDist * 0.004) {
            hit = true;
            hitU = curU;
            hitP = p;
            vec2 sampleUV = fract(vec2(hitU / 6.2831853 + 0.5, p.z * 0.4));
            vec3 texCol = img(sampleUV);
            vec3 pal = imgPalette(hitU / 6.2831853 + t * 0.05);
            hitCol = mix(texCol, pal, 0.5) * (0.55 + 0.65 * exp(-totDist * 0.35));
            break;
        }

        if (totDist > 8.0) break;

        totDist += max(0.004, ad * 0.6);
    }

    // Glowing surface ribs. The old scalar was exp(-minD * k), but now that
    // the march actually lands on the surface minD is ~0 for every hit pixel,
    // which would turn the rib term into a full-frame constant. Read the
    // ribbing off the hit point's own (u, v) surface coordinates instead --
    // that is what "ribbing resolution" was meant to modulate.
    vec2 ribVec = vec2(length(hitP.xy) - rB, hitP.z);
    float ribV = (dot(ribVec, ribVec) > 1e-8) ? atan(ribVec.y, ribVec.x) : 0.0;
    float ribs = pow(max(0.0, sin(hitU * 3.0 + ribV * (5.0 + 4.0 * audioCentroid) + t)), 6.0);
    float ribGlow = ribs * glw * float(hit) * (0.30 + 0.25 * audioLevel);
    vec3 glowTint = min(vec3(1.3, 1.1, 1.8) * ribGlow * (1.0 + 2.5 * audioKick), vec3(1.15));

    // Surface-vs-background selection. The old test was
    // mix(bg, hitCol, clamp(length(hitCol), 0, 1)) -- with a dark photo a
    // genuine hit has length ~0.18, so it silently blended 82% of the even
    // darker background back in and crushed the surface into the floor. Use
    // the march's own hit flag, and let DISTANCE, not brightness, do the fade.
    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.3) * (0.30 + 0.20 * audioLevel);
    vec3 finalCol = hit ? hitCol : bgCol;
    finalCol = mix(finalCol, bgCol, clamp(totDist * 0.09, 0.0, 0.5));

    // Everything above is photo-derived, so put the plunge on a fixed
    // exposure rather than inheriting whatever the bound image happens to be.
    finalCol *= clamp(0.28 / max(0.05, photoLevel()), 0.35, 3.2);
    finalCol += glowTint;

    finalCol = pow(finalCol, vec3(0.88));
    vec3 _catTone = clamp(finalCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.25 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
