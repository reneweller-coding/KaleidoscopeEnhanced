#version 330 core
out vec4 fragColor;
/**
 * @file SierpinskiOctahedronAbyss.frag
 * @brief SIERPINSKI OCTAHEDRON ABYSS: 3D Raymarching continuous dive into the heart
 * of a Sierpinski Octahedron (IFS) fractal. Endless nested pyramid canyons,
 * sharp triangular facet reflections, and high-voltage glowing vertex sparks.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward plunge into recursive pyramid voids
 *   audioKick    -> flashes octahedron vertex nodes & triggers lattice expansion burst
 *   audioCentroid-> sharpens triangular facet edge resolution
 *   audioSubBass -> expands octahedron breathing scale
 *   audioChromaHue-> rotates the luminous geometric crystal palette
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

// 3D Sierpinski Octahedron IFS distance estimator
float mapSierpinski(vec3 p, float t, out float trapLevel) {
    vec3 q = p;
    float scale = 1.0;
    trapLevel = 0.0;

    for (int i = 0; i < 6; i++) {
        // Octahedral plane foldings
        if (q.x + q.y < 0.0) q.xy = -q.yx;
        if (q.x + q.z < 0.0) q.xz = -q.zx;
        if (q.y + q.z < 0.0) q.yz = -q.zy;

        q = q * 2.0 - vec3(1.2, 1.2, 1.2);
        scale *= 2.0;
        trapLevel += dot(q, q) * 0.08;
    }

    // Distance to regular octahedron base
    float dOct = (abs(q.x) + abs(q.y) + abs(q.z) - 1.2) / scale;
    return dOct * 0.7;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc = (scaleP > 0.01) ? scaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.168 * spd + audioAdvance * 0.168 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Continuous dive along diagonal axis towards origin
    float diveProg = mod(t * 0.6, 2.0);
    vec3 ro = vec3(2.5 - diveProg * 0.8, 2.5 - diveProg * 0.8, 2.5 - diveProg * 0.8) * sc;
    vec3 ta = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.25 + 0.2 * sin(audioSwell * 2.0)) * ww);

    // Raymarch through Sierpinski fractal
    float totDist = 0.0;
    float minD = 1e4;
    float hitTrap = 0.0;
    vec3 hitCol = vec3(0.0);

    // Sub-bass breathes the whole octahedron lattice. Done as the textbook
    // uniform-scale wrap (divide the sample point, multiply the returned
    // distance) so the estimator stays conservative -- scaling only one side
    // would overshoot the surface and punch holes in the fractal.
    float breath = 1.0 + 0.30 * audioSubBass;

    for (int i = 0; i < 54; i++) {
        vec3 p = ro + rd * totDist;
        float curTrap;
        float d = mapSierpinski(p / breath, t, curTrap) * breath;
        minD = min(minD, abs(d));

        if (abs(d) < 0.003 || totDist > 8.0) {
            hitTrap = curTrap;
            vec2 sampleUV = fract(p.xy * 0.3 + p.z * 0.3 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(hitTrap * 0.2 + t * 0.05);
            hitCol = mix(texCol, palCol, 0.5) * (0.7 + 0.4 * (1.0 - d));
            break;
        }

        totDist += max(0.015, d * 0.7);
    }

    // Glowing triangular facet edges. minD tracks the MINIMUM distance seen
    // across the whole 54-step march, so for a ray passing anywhere near
    // this recursively-detailed fractal it sits close to 0 across most of
    // the visible silhouette -- and the 1.7 tint constant alone already
    // exceeds 1.0 with NO kick at all, which is why the whole fractal shape
    // (not just its edges) was blowing out to a flat white triangle on
    // every frame. Cap the glow*audio product directly.
    float edgeGlow = min(exp(-minD * (26.0 + 14.0 * audioCentroid)) * glw * (1.0 + 2.5 * audioKick), 0.55);
    vec3 glowTint = vec3(1.4, 1.1, 1.7) * edgeGlow;

    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.2) * (0.2 + 0.15 * audioLevel);
    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint;

    finalCol = pow(finalCol, vec3(0.88));
    vec3 _catTone = clamp(finalCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
