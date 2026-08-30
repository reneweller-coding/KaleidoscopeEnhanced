#version 330 core
out vec4 fragColor;
/**
 * @file CliffordTorusStereographicKaleido.frag
 * @brief CLIFFORD TORUS STEREOGRAPHIC KALEIDO: 4D Clifford Torus (S1 x S1 in S3)
 * stereographically projected into 3D space. Nested Villarceau circles, continuous
 * isoclinic SO(4) rotations, and dynamic conformal interference rings.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous 4D Villarceau circle rotation & flight
 *   audioKick    -> flashes Villarceau ring intersection nodes & radial shockwave
 *   audioCentroid-> modulates ring frequency & stereographic grid density
 *   audioSubBass -> expands Clifford torus major radius breathing
 *   audioChromaHue-> rotates the stereographic torus rainbow palette
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
uniform float ringDensityP;
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

// 4D isoclinic rotation of a 4-vector (p.x, p.y, p.z, p.w)
vec4 rotate4D(vec4 p, float a1, float a2) {
    float c1 = cos(a1), s1 = sin(a1);
    float c2 = cos(a2), s2 = sin(a2);
    vec4 q = p;
    q.xy = vec2(c1 * p.x - s1 * p.y, s1 * p.x + c1 * p.y);
    q.zw = vec2(c2 * p.z - s2 * p.w, s2 * p.z + c2 * p.w);
    return q;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rDens = (ringDensityP > 0.01) ? ringDensityP : 1.0;
    float twst = (twistP > 0.01) ? twistP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.180 * spd + audioAdvance * 0.180 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Inverse stereographic projection of 2D screen coordinate uv to S3 4D hypersphere
    float r2 = dot(uv, uv);
    vec4 p4 = vec4(2.0 * uv.x, 2.0 * uv.y, r2 - 1.0, 0.5 * sin(t * 0.5)) / (r2 + 1.0);
    p4 = normalize(p4);

    // Apply 4D rotations
    float rot1 = t * 0.35 + audioPhase * 0.1;
    float rot2 = t * 0.25 + audioSwell * 0.4;
    p4 = rotate4D(p4, rot1, rot2);

    // Clifford Torus parameterization in 4D: (cos(u)/sqrt(2), sin(u)/sqrt(2), cos(v)/sqrt(2), sin(v)/sqrt(2))
    float u = atan(p4.y, p4.x);
    float v = atan(p4.w, p4.z);

    // Distance to Clifford Torus surface in S3: |p4.x^2 + p4.y^2 - R2|.
    // R2 = 0.5 is the canonical (equal-radius) torus; sub-bass breathes that
    // major radius. dot(p4.xy,p4.xy) spans 0..1 for the normalized p4, so the
    // swollen radius stays inside the hypersphere.
    float torusR2 = 0.5 * (1.0 + 0.30 * audioSubBass);
    float dClifford = abs(dot(p4.xy, p4.xy) - torusR2);

    // Villarceau nested circular streamlines
    float villarceau1 = sin((u + v) * 4.0 * rDens + t * 2.0 * twst);
    float villarceau2 = sin((u - v) * 4.0 * rDens - t * 2.0 * twst);
    float vGrid = abs(villarceau1 * villarceau2);

    // Sample texture mapped onto (u, v) toroidal coordinates
    vec2 sampleUV = fract(vec2(u / 6.2831853 + 0.5, v / 6.2831853 + 0.5));
    vec3 texCol = img(sampleUV);

    // Luminous Villarceau streamlines
    float ringGlow = exp(-vGrid * (16.0 + 10.0 * audioCentroid)) * glw;
    float surfaceGlow = exp(-dClifford * 20.0);

    // Color palette blending
    vec3 palA = imgPalette((u + v) / 6.2831853 + t * 0.05);
    vec3 palB = imgPalette((u - v) / 6.2831853 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(u * 2.0));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);
    // The ray gaps used to read as a flat pale wash because this base
    // palette/photo mix sat near the tonemap ceiling across the frame, so it
    // is held back to give the rays something darker to stand against. 0.6
    // was too deep once the surfaceGlow gate below started attenuating the
    // rings as well -- the two stacked and the whole scene went muddy
    // (measured luma 0.124, contrast 0.033).
    col *= 0.82;

    // Add glowing Villarceau rings & intersection node flashes. The first
    // pass's 0.85 cap plus a 0.4 knee still let ~50% of the frame clip,
    // matching the re-verification's "flat white in the ray gaps" -- vGrid's
    // ray pattern (product of two sine sunburst terms) stays small across
    // WIDE angular bands, not just thin lines, and the 1.7-peak tint channel
    // survived even the 0.85 cap. Tighten the cap and lower the tint
    // constants themselves so a fully-lit ring band stays well under 1.0.
    // Gate the rings by proximity to the torus surface -- they live ON it, so
    // the lit band visibly travels outward as sub-bass swells torusR2. Pure
    // attenuation (max factor 1.0), so it cannot re-open the clipping problem.
    vec3 ringTint = vec3(1.0, 0.85, 1.3) * min(ringGlow * (1.0 + 2.0 * audioKick), 0.5) * (0.55 + 0.45 * surfaceGlow);
    float nodeFlash = min(exp(-vGrid * 40.0) * audioKick * 2.0, 0.6);
    col += ringTint + vec3(1.2, 1.1, 1.4) * nodeFlash;

    // Center focal bloom
    float centerBloom = min(exp(-r2 * 4.0) * (0.6 + 1.2 * audioLevel), 0.6);
    col += imgPalette(0.85) * centerBloom;

    col = pow(col, vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.85 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
