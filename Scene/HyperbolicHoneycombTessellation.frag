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


uniform float audioChromaHue;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
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

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return cmul(a, vec2(b.x, -b.y)) / max(dot(b, b), 1e-9); }

// USER-FEEDBACK-REDESIGN: an actual hyperbolic MIRROR tessellation on the
// Poincaré disk (the old 3D fold-walk produced smeared noise).  Radial
// mirrors + a circle-inversion mirror generate the {6,q} honeycomb; a slow
// Möbius translation swims the camera through hyperbolic space, and the
// photo lives inside every fundamental cell.
void main() {
    float ply = (polyP  > 0.0) ? polyP  : 1.0;
    float zm  = (zoomP  > 0.0) ? zoomP  : 1.0;
    float fct = (facetP > 0.0) ? facetP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float t = time * 0.10 + audioAdvance * 0.10;

    // Poincaré disk coordinates; gentle breathing zoom.
    vec2 z = uv * (1.06 / zm) * (1.0 - 0.05 * audioSwell);
    float rr0 = dot(z, z);
    float inDisk = smoothstep(1.02, 0.985, sqrt(rr0));

    // Möbius translation = swim through the hyperbolic plane (jump-free).
    vec2 a = 0.28 * vec2(cos(t), sin(t * 0.77));
    z = cdiv(z + a, vec2(1.0, 0.0) + cmul(vec2(a.x, -a.y), z));
    z = mat2(cos(t * 0.5), -sin(t * 0.5), sin(t * 0.5), cos(t * 0.5)) * z;

    // Reflection group: N radial mirrors + one inversion circle.
    float N   = floor(5.0 + 2.0 * ply + 0.5);
    float sec = 3.1415927 / N;
    vec2  ic  = vec2(1.04, 0.0);                    // inversion circle centre
    float irad = 0.55 + 0.06 * sin(t * 0.9);        // breathing cell size

    float refl = 0.0;
    float edgeMin = 1e9;
    for (int i = 0; i < 34; ++i) {
        // fold the angle into one sector (radial mirrors)
        float ang = atan(z.y, z.x);
        float folded = abs(mod(ang, 2.0 * sec) - sec);
        if (abs(folded - abs(ang)) > 1e-6) refl += 1.0;
        z = vec2(cos(folded), sin(folded)) * length(z);

        // invert across the mirror circle if inside it
        vec2 dz = z - ic;
        float d2 = dot(dz, dz);
        edgeMin = min(edgeMin, abs(sqrt(d2) - irad));
        if (d2 < irad * irad) {
            z = ic + dz * (irad * irad / max(d2, 1e-7));
            refl += 1.0;
        } else if (i > 0) break;
    }

    // Photo inside the fundamental cell; parity checkers the mirror copies.
    vec3 cell = img(fract(z * (0.85 * fct) + vec2(0.5) + 0.03 * t));
    float parity = mod(refl, 2.0);
    cell *= 0.72 + 0.28 * parity;

    // Mirror seams glow; hyperbolic depth fog toward the disk rim.
    float seam = exp(-edgeMin * (26.0 + 14.0 * audioHigh));
    vec3 lit = imgPalette(0.30 + 0.10 * refl) * 1.4;
    float fog = 1.0 - smoothstep(0.55, 1.0, sqrt(rr0));

    vec3 col = cell * (0.55 + 0.45 * fog) * (0.85 + 0.5 * audioLevel)
             + lit * seam * (0.7 + 0.9 * audioKick)
             + lit * 0.12;
    col *= inDisk;
    col += imgPalette(0.6) * (1.0 - inDisk) * 0.08;   // faint halo outside

    if (hue > 0.001) col = hueRot(col, hue);
    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(col, 1.0);
}
