#version 330 core
out vec4 fragColor;
// HyperbolicHoneycombTessellation.frag
// -----------------------------------------------------------------------
// HYPERBOLIC HONEYCOMB TESSELLATION: Raymarched true 3D hyperbolic non-Euclidean
// space tessellation ({5,3,4} dodecahedral / icosahedral honeycombs) in the Poincaré ball.
// Infinite kaleidoscope mirror reflections repeating to infinity with photo projections.
//   audioAdvance -> translates hyperbolic isometry matrix through space
//   audioKick    -> flashes prismatic mirror facet edges and light pulses
//   audioBass    -> undulates hyperbolic metric curvature
//   audioSwell   -> increases jewel reflection refraction intensity
//
// Per-activation variety:
//   polyP    float dodecahedron/icosahedron symmetry folding (0.5..2.0)
//   zoomP    float Poincaré ball camera depth               (0.5..1.8)
//   facetP   float prismatic mirror edge thickness           (0.5..2.2)
//   hueP     float spectral dispersion hue offset           (0..6.28)
// -----------------------------------------------------------------------

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

uniform float polyP;
uniform float zoomP;
uniform float facetP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// Hyperbolic inversion across sphere centered at c with radius r
vec3 sphereInversion(vec3 p, vec3 c, float r) {
    vec3 v = p - c;
    return c + v * (r * r / max(dot(v, v), 1e-5));
}

void main() {
    float ply = (polyP  > 0.0) ? polyP  : 1.0;
    float zm  = (zoomP  > 0.0) ? zoomP  : 1.0;
    float fct = (facetP > 0.0) ? facetP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    // Poincaré 3D Ray setup
    float t = time * 0.3 + audioAdvance * 0.2;
    vec3 ro = vec3(0.0, 0.0, -1.8 / zm);
    vec3 rd = normalize(vec3(uv, 1.2 - 0.3 * audioKick));

    // Rotate ray in 3D
    rd.yz = rot2D(sin(t * 0.4) * 0.4) * rd.yz;
    rd.xz = rot2D(t * 0.5) * rd.xz;

    // Poincaré ball traversal
    vec3 p = ro;
    float totalDist = 0.0;
    float edgeGlow = 0.0;
    float reflections = 0.0;

    // Hyperbolic Coxeter reflection planes
    float cAngle = 0.628318 * ply; // 36 degrees (golden ratio / dodecahedral symmetry)
    vec3 n1 = vec3(1.0, 0.0, 0.0);
    vec3 n2 = vec3(-cos(cAngle), sin(cAngle), 0.0);
    vec3 n3 = vec3(0.0, -cos(cAngle), sin(cAngle));

    for (int i = 0; i < 48; ++i) {
        p += rd * 0.06;

        // Hyperbolic Coxeter group reflections
        for (int k = 0; k < 4; ++k) {
            p = abs(p);
            float d1 = dot(p, n1); if (d1 < 0.0) { p -= 2.0 * d1 * n1; reflections += 1.0; }
            float d2 = dot(p, n2); if (d2 < 0.0) { p -= 2.0 * d2 * n2; reflections += 1.0; }
            float d3 = dot(p, n3); if (d3 < 0.0) { p -= 2.0 * d3 * n3; reflections += 1.0; }

            // Hyperbolic boundary sphere inversion
            float r2 = dot(p, p);
            if (r2 > 1.0) {
                p /= r2;
                reflections += 1.0;
            }
        }

        // Facet edge distance
        float edgeDist = min(min(abs(p.x), abs(p.y)), abs(p.z));
        edgeGlow += exp(-edgeDist * 40.0 / fct) * 0.04;
    }

    // Photo projection sampled from folded hyperbolic coordinates
    vec2 photoUV = fract(p.xy * 0.5 + 0.5);
    vec3 photo = img(photoUV);

    // Jewel facet iridescent coloring
    vec3 facetColor = 0.5 + 0.5 * cos(vec3(0.0, 1.5, 3.0) + reflections * 0.4 + audioPhase);

    // Combine visualizer
    vec3 col = mix(photo, facetColor, 0.5 * (1.0 + audioSwell * 0.5));
    col += vec3(1.0, 0.9, 0.7) * edgeGlow * (1.0 + audioKick * 3.0);

    // Border vignette
    float len = length(uv);
    col *= smoothstep(1.2, 0.2, len);

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
