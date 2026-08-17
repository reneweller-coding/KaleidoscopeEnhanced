#version 330 core
out vec4 fragColor;
// MagnetarCrustquakeSGR.frag
// -----------------------------------------------------------------------
// MAGNETAR CRUSTQUAKE SGR: Ultra-magnetic neutron star ($10^{15}$ Gauss)
// displaying tectonic crust fractures (starquakes). Torsional Alfvén waves
// twist the magnetosphere, triggering giant Soft Gamma Repeater (SGR) flares,
// positron pair-plasma fountains, and relativistic synchrotron photo mapping.
//   audioAdvance -> rotates magnetosphere dipolar magnetic field lines
//   audioKick    -> triggers catastrophic starquake crust fractures & gamma flashes
//   audioBass    -> undulates torsional Alfvén wave shear amplitude
//   audioCentroid-> shifts synchrotron radiation emission frequency
//
// Per-activation variety:
//   crustP  float crust fracture density & fault lines    (0.5..2.2)
//   burstP  float gamma-ray burst & flare radiance        (0.5..2.0)
//   speedP  float magnetar rotation velocity              (0.5..2.0)
//   hueP    float synchrotron chromatic hue offset        (0..6.28)
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
uniform float audioChromaHue;

uniform float crustP;
uniform float burstP;
uniform float speedP;
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

// Voronoi crust fracture generator
float hash21(vec2 p) {
    p = fract(p * vec2(434.34, 735.21));
    p += dot(p, p + 52.32);
    return fract(p.x * p.y);
}

float voronoiCrust(vec2 p) {
    vec2 g = floor(p);
    vec2 f = fract(p);
    float minDist = 1.0;
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            vec2 lattice = vec2(float(x), float(y));
            vec2 offset = vec2(hash21(g + lattice), hash21(g + lattice + 33.7));
            vec2 d = lattice + offset - f;
            minDist = min(minDist, length(d));
        }
    }
    return minDist;
}

void main() {
    float crs = (crustP > 0.0) ? crustP : 1.0;
    float brs = (burstP > 0.0) ? burstP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Neutron star surface sphere: r < 0.45
    float starRadius = 0.42 + 0.05 * sin(t * 0.8);
    float isStar = smoothstep(starRadius + 0.02, starRadius - 0.02, r);

    // Crust voronoi fractures (fault lines)
    vec2 crustCoord = uv * 10.0 * crs + vec2(t * 0.5, 0.0);
    float fracture = voronoiCrust(crustCoord);
    float faultLines = exp(-fracture * 18.0) * isStar;

    // Starquake fault rupture glow on kick
    float quakeGlow = faultLines * (audioKick * 4.0 * brs + audioHigh * 2.0);

    // Dipolar magnetosphere field lines in exterior: r > starRadius
    float dipoleAngle = angle + sin(r * 8.0 - t * 4.0) * 0.6 * (1.0 + audioBass);
    float dipoleField = abs(sin(dipoleAngle * 6.0));
    float alfvenWaves = sin(r * 30.0 - t * 10.0) * exp(-r * 2.0);
    float magnetosphere = dipoleField * exp(-abs(r - starRadius) * 4.0) * (1.0 + alfvenWaves * 0.5);

    // Soft Gamma Repeater (SGR) polar flare burst
    vec2 northPole = vec2(0.0, starRadius * 0.9);
    float poleDist = length(uv - northPole);
    float sgrFlare = exp(-poleDist * 8.0) * (audioKick * 3.5 * brs + audioSubBass * 1.5);

    // Photo texture mapping into crust plates and magnetic sheets
    vec2 photoUV = st + vec2(sin(dipoleAngle), cos(dipoleAngle)) * 0.04 * (1.0 + audioKick * 0.6);
    vec3 photo = img(fract(photoUV));

    // Magnetar color palette (neutron iron crust, gamma violet-cyan, plasma white)
    vec3 crustColor = mix(vec3(0.08, 0.06, 0.1), vec3(0.2, 0.15, 0.3), isStar);
    vec3 flareColor = vec3(0.2, 0.9, 1.0);
    vec3 gammaWhite = vec3(1.0, 0.98, 0.95);

    // Combine visualizer
    vec3 col = mix(crustColor, photo * 0.8, 0.4 + 0.2 * audioLevel);
    col += magnetosphere * flareColor * (1.0 + audioSwell * 0.8);
    col += quakeGlow * vec3(1.0, 0.85, 0.3) * 2.0;
    col += sgrFlare * gammaWhite * 2.5;

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, r);
    col *= vig;

    fragColor = vec4(col, 1.0);
}
