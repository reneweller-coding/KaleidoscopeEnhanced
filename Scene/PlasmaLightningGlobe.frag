#version 330 core
out vec4 fragColor;
// PlasmaLightningGlobe.frag
// -----------------------------------------------------------------------
// PLASMA LIGHTNING GLOBE: Dielectric breakdown plasma globe with dozens of snaking,
// branching high-voltage filament arcs striking the glass sphere, central electrode glow,
// and electric neon magenta/cyan gas ionization trails.
//   audioHigh    -> sparks new dielectric breakdown plasma filament branches
//   audioKick    -> flashes high-energy arc discharges to glass boundary
//   audioSwell   -> thickens noble gas ionization luminescence
//   audioPhase   -> twists plasma filament tendril paths
//
// Per-activation variety:
//   arcP     float plasma filament density & count         (0.5..2.2)
//   branchP  float dielectric branching complexity         (0.5..2.0)
//   glassP   float glass spherical refraction intensity    (0.5..1.8)
//   hueP     float plasma ionization color shift           (0..6.28)
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

uniform float arcP;
uniform float branchP;
uniform float glassP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.12));
    p += dot(p, p + 56.45);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    float arc = (arcP    > 0.0) ? arcP    : 1.0;
    float brn = (branchP > 0.0) ? branchP : 1.0;
    float gls = (glassP  > 0.0) ? glassP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Glass sphere boundary at r = 0.48
    float glassR = 0.48;
    float insideGlass = step(r, glassR);

    // Spherical glass refraction
    float glassZ = sqrt(max(glassR * glassR - r * r, 0.0));
    vec2 refrUV = st + (uv / max(r, 0.01)) * (1.0 - glassZ / glassR) * 0.08 * gls;
    vec3 photo = img(clamp(refrUV, 0.0, 1.0));

    // Central high-voltage graphite electrode core at r = 0.08
    float coreDist = length(uv);
    float coreGlow = (0.005 / (coreDist * coreDist + 0.001)) * (1.0 + audioKick * 2.0);
    vec3 coreColor = vec3(0.9, 0.3, 1.0) * coreGlow;

    // Snaking plasma filaments
    vec3 filamentCol = vec3(0.0);
    int numArcs = int(8.0 * arc);

    float t = time * 2.5 + audioAdvance * 1.5;

    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        float baseAngle = (fi / 8.0) * 6.2831853 + sin(t * 0.3 + fi) * 0.4;

        // Tendril path with dielectric breakdown noise
        float arcRadius = r / glassR;
        float wiggle = (noise(vec2(arcRadius * 8.0 * brn, t + fi * 10.0)) - 0.5) * 0.35 * arcRadius;
        float targetAngle = baseAngle + wiggle;

        float angleDist = abs(mod(a - targetAngle + 3.14159, 6.28318) - 3.14159);
        float distToArc = angleDist * r;

        float arcGlow = (0.0012 / (distToArc * distToArc + 0.0001)) * step(0.06, r) * step(r, glassR);

        // Neon magenta/electric cyan ionization gradient
        vec3 aCol = mix(vec3(1.0, 0.1, 0.8), vec3(0.1, 0.8, 1.0), arcRadius);
        filamentCol += aCol * arcGlow;
    }

    // Glass rim glow and touch point flares
    float glassRim = abs(r - glassR);
    float rimGlow = (0.0015 / (glassRim * glassRim + 0.00015)) * (0.8 + 0.4 * audioSwell);
    vec3 rimCol = vec3(0.3, 0.7, 1.0) * rimGlow;

    // Combine visualizer
    vec3 col = photo * 0.25 + coreColor + filamentCol * (1.0 + audioHigh * 2.0 + audioKick * 2.0) + rimCol;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
