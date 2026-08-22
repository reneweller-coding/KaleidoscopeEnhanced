#version 330 core
out vec4 fragColor;
/**
 * @file PrismaticCrystalChamber4D.frag
 * @brief PRISMATIC CRYSTAL CHAMBER 4D: Raymarching within a 4-dimensional
 * hyper-polychoron with spectral dispersion, multi-facet reflections,
 * and high-velocity SO(4) isoclinic double rotations.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous 4D double rotation plane progression
 *   audioKick    -> flashes internal laser nodes & expands facet clearance
 *   audioCentroid-> modulates chromatic dispersion spread
 *   audioSubBass -> expands the hyper-chamber chamber breathing
 *   audioChromaHue-> steers the prism spectrum rotation
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
uniform float facetP;
uniform float dispersionP;
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

// 4D Rotation matrix along two orthogonal planes (XY and ZW)
vec4 rotate4D(vec4 p, float a1, float a2) {
    float c1 = cos(a1), s1 = sin(a1);
    float c2 = cos(a2), s2 = sin(a2);
    vec4 q = p;
    // Plane 1: XY
    q.xy = vec2(c1 * p.x - s1 * p.y, s1 * p.x + c1 * p.y);
    // Plane 2: ZW
    q.zw = vec2(c2 * p.z - s2 * p.w, s2 * p.z + c2 * p.w);
    return q;
}

// Distance estimator for 4D Polychoron (Hyper-Octahedron / 16-Cell & 24-Cell cross-section)
float map4D(vec4 p, float facet) {
    vec4 q = abs(p);
    // Sub-bass breathes the chamber open. These constants are pure facet
    // OFFSETS, so scaling them moves every wall outward together without
    // touching the estimator's Lipschitz bound -- the march stays conservative.
    float grow = 1.0 + 0.25 * audioSubBass;
    // 16-Cell SDF in 4D: (sum |x_i|) - R
    float d16 = (q.x + q.y + q.z + q.w - 2.2 * grow) * 0.5;
    // Hypercube bounds
    float dBox = max(max(q.x, q.y), max(q.z, q.w)) - 1.35 * grow;
    // Intersection of 24-cell facets
    float d24 = max(d16, (max(q.x + q.y, q.z + q.w) - 1.8 * grow) * 0.7071);
    return mix(d24, dBox, facet * 0.4);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float fct = (facetP > 0.01) ? facetP : 1.0;
    float disp = (dispersionP > 0.01) ? dispersionP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.25 * spd;
    float rot1 = t * 0.4 + audioPhase * 0.15;
    float rot2 = t * 0.27 + audioSwell * 0.5;

    // Ray setup in 3D, projected into 4D with W coordinate based on focal length
    vec3 ro3 = vec3(0.0, 0.0, -3.6 + 0.3 * sin(t * 0.5));
    vec3 rd3 = normalize(vec3(uv, 1.25 + 0.25 * sin(audioSwell * 2.0)));

    vec3 accCol = vec3(0.0);
    float glowAcc = 0.0;

    // Multi-spectral chromatic raymarch (R, G, B channels slightly refracted)
    vec3 wavelengths = vec3(0.97, 1.0, 1.03) * (1.0 + 0.15 * (audioCentroid + audioFlux) * disp);

    for (int c = 0; c < 3; c++) {
        float wl = (c == 0) ? wavelengths.r : ((c == 1) ? wavelengths.g : wavelengths.b);
        vec3 rd = normalize(rd3 * vec3(wl, wl, 1.0));
        vec3 ro = ro3;

        // Near clip: the polychoron rotating through W periodically
        // sweeps a cell over the camera; without this the whole frame
        // collapsed to one flat colour sample whenever that happened.
        float totalDist = 0.65;
        float minD = 1e4;
        vec3 colChannel = vec3(0.0);

        for (int i = 0; i < 48; i++) {
            vec3 pos3 = ro + rd * totalDist;
            // Embed 3D point into 4D hyperspace with oscillating 4th dimension
            vec4 pos4 = vec4(pos3, sin(totalDist * 0.8 + t * 0.6) * 0.85);
            pos4 = rotate4D(pos4, rot1, rot2);

            float d = map4D(pos4, fct);
            minD = min(minD, abs(d));

            if (abs(d) < 0.003 || totalDist > 8.0) {
                // Surface hit: compute normal in 4D & reflect
                vec4 n4;
                float eps = 0.005;
                n4.x = map4D(pos4 + vec4(eps,0,0,0), fct) - map4D(pos4 - vec4(eps,0,0,0), fct);
                n4.y = map4D(pos4 + vec4(0,eps,0,0), fct) - map4D(pos4 - vec4(0,eps,0,0), fct);
                n4.z = map4D(pos4 + vec4(0,0,eps,0), fct) - map4D(pos4 - vec4(0,0,eps,0), fct);
                n4.w = map4D(pos4 + vec4(0,0,0,eps), fct) - map4D(pos4 - vec4(0,0,0,eps), fct);
                n4 = normalize(n4);

                vec2 uvMap = fract(pos4.xy * 0.4 + pos4.zw * 0.4 + 0.5);
                vec3 surfCol = img(uvMap) * imgPalette(dot(pos4, vec4(0.2, 0.3, 0.4, 0.1)));
                colChannel = surfCol * (0.6 + 0.4 * abs(n4.z));
                break;
            }

            totalDist += max(0.02, d * 0.65);
        }

        // Volumetric facet edge glow -- minD tracks the closest approach
        // over the ENTIRE march for this dispersion channel, so it reads
        // near-zero for almost any ray landing inside the polychoron's
        // octagonal silhouette (which the facets nearly fill from this
        // camera distance), not just true facet-edge hits. Left uncapped
        // this saturated the additive tint across the whole interior,
        // clipping to white; only rays that actually miss the shape
        // (outside the octagon) kept a large minD and stayed dark.
        float edgeGlow = exp(-minD * (24.0 + 10.0 * audioCentroid)) * glw;
        edgeGlow = min(edgeGlow, 0.45);
        vec3 spectralTint = (c == 0) ? vec3(1.2, 0.3, 0.2) : ((c == 1) ? vec3(0.2, 1.2, 0.4) : vec3(0.3, 0.5, 1.4));

        accCol += (colChannel + edgeGlow * spectralTint * (1.0 + 2.0 * audioKick)) * 0.3333;
        glowAcc += edgeGlow * 0.3333;
    }

    // Dynamic background flare
    vec3 bgCol = imgPalette(length(uv) * 0.5 + t * 0.1) * 0.25;
    vec3 finalCol = mix(bgCol, accCol, clamp(length(accCol), 0.0, 1.0));

    // Center flare tint -- glowAcc is already bounded by the edgeGlow cap
    // above, but audioSwell itself is an unbounded audio-energy scalar
    // (used raw elsewhere in this file), so cap its contribution here too
    // rather than letting a strong swell alone blow this additive term out.
    finalCol += vec3(0.1, 0.15, 0.25) * glowAcc * min(audioSwell, 1.5);

    // Contrast & saturation enhancement with a soft-knee compression so
    // the facet-edge glow compresses gracefully instead of clipping
    // straight to white.
    finalCol = pow(finalCol, vec3(0.88));
    vec3 _catTone = clamp(finalCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
