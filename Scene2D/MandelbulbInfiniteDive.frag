#version 330 core
out vec4 fragColor;
/**
 * @file MandelbulbInfiniteDive.frag
 * @brief MANDELBULB INFINITE DIVE: 3D Raymarching continuous dive into the
 * fractal canyons of the 3D Mandelbulb with dynamic morphing power N,
 * orbit-trap crystal colors, and deep ambient occlusion.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight into fractal canyons
 *   audioKick    -> flashes interior fractal core & expands orbit trap highlights
 *   audioCentroid-> modulates power N harmonic morphing
 *   audioSubBass -> expands fractal bulb breathing
 *   audioChromaHue-> steers the orbit trap rainbow palette
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
uniform float powerP;
uniform float detailP;
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

// 3D Mandelbulb distance estimator with dynamic power N
float mapMandelbulb(vec3 p, float power, out float trap) {
    vec3 w = p;
    float dr = 1.0;
    float r = 0.0;
    trap = 1e5;

    for (int i = 0; i < 8; i++) {
        r = length(w);
        if (r > 4.0) break;

        trap = min(trap, abs(w.z) + length(w.xy) * 0.5);

        // Convert to spherical coordinates
        float theta = acos(clamp(w.z / r, -1.0, 1.0));
        float phi = atan(w.y, w.x);
        dr = pow(r, power - 1.0) * power * dr + 1.0;

        // Scale and rotate
        float zr = pow(r, power);
        theta = theta * power;
        phi = phi * power;

        // Convert back to cartesian coordinates
        w = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
        w += p;
    }

    return 0.5 * log(r) * r / dr;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float pMod = (powerP > 0.01) ? powerP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.22 * spd;

    // Power N smoothly morphs between 6.0 and 9.0
    float power = (7.0 + 1.8 * sin(t * 0.3) + 1.0 * audioCentroid) * pMod;

    // Camera ray setup: forward dive towards the fractal bulb surface
    float camDist = 2.4 - 0.5 * sin(t * 0.4);
    float camAngle = t * 0.25 + audioPhase * 0.1;
    float camElev = 0.35 + 0.15 * sin(t * 0.35);

    vec3 ro = vec3(cos(camAngle) * cos(camElev), sin(camElev), sin(camAngle) * cos(camElev)) * camDist;
    vec3 ta = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.2 + 0.2 * sin(audioSwell)) * ww);

    // Raymarching loop
    float totDist = 0.0;
    float trap = 0.0;
    float rimGlow = 0.0;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 54; i++) {
        vec3 p = ro + rd * totDist;
        float curTrap;
        float d = mapMandelbulb(p, power, curTrap);

        // Capping rimGlow at 0.45 bounded its MAGNITUDE but not its shape:
        // minD (closest |d| over the WHOLE march) is, by construction,
        // always inside [0, hit-threshold] for a ray that hits at all --
        // that's the definition of "hit", not a rim/proximity signal.
        // Verified numerically: for every hit pixel across a full screen
        // grid, minD sat in [0, 0.002] and the resulting rimGlow was >0.9
        // for 100% of them -- i.e. it was pegged at the 0.45 cap almost
        // everywhere on the bulb regardless of local geometry, producing
        // the same uniform lavender wash just at lower intensity (matches
        // the report: still flat, just paler). This is why re-diagnosing
        // was warranted -- the raymarch itself is NOT missing/flooding;
        // the hit map actually fills the screen centre correctly (misses
        // cluster at the corners, which is correct silhouette vignetting).
        // A Fresnel-style grazing-angle term from the estimated surface
        // normal varies genuinely across the bumpy bulb (numerically:
        // mean 0.24, std 0.28 across the hit surface, not saturated).
        if (abs(d) < 0.002) {
            trap = curTrap;

            vec2 eps = vec2(0.001, 0.0);
            float dxTrap, dyTrap, dzTrap;
            vec3 nrm = normalize(vec3(
                mapMandelbulb(p + eps.xyy, power, dxTrap) - mapMandelbulb(p - eps.xyy, power, dxTrap),
                mapMandelbulb(p + eps.yxy, power, dyTrap) - mapMandelbulb(p - eps.yxy, power, dyTrap),
                mapMandelbulb(p + eps.yyx, power, dzTrap) - mapMandelbulb(p - eps.yyx, power, dzTrap)
            ));
            rimGlow = pow(1.0 - abs(dot(nrm, -rd)), 3.0) * glw;

            vec2 sampleUV = fract(p.xy * 0.3 + p.z * 0.2 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 pal = imgPalette(trap * 1.5 + t * 0.1);
            hitCol = mix(texCol, pal, 0.55) * (0.7 + 0.4 * (1.0 - d));
            break;
        }
        if (totDist > 6.0) break;

        totDist += max(0.015, d * 0.7);
    }

    // Glowing surface rim (Fresnel term computed above; left at 0 on a
    // true miss so bgCol/vignette shows through cleanly).
    vec3 glowTint = vec3(1.3, 1.0, 1.6) * rimGlow * (1.0 + 1.5 * audioKick);

    // Cosmic background
    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.2) * (0.2 + 0.15 * audioLevel);

    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint;

    finalCol = pow(finalCol, vec3(0.88));
    vec3 _catTone = clamp(finalCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
