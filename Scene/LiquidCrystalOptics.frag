#version 330 core
out vec4 fragColor;
// LiquidCrystalOptics.frag
// -----------------------------------------------------------------------
// LIQUID CRYSTAL OPTICS: Polarized optical microscopy of dynamic nematic
// liquid crystal phases with topological Schlieren brushes, disclination
// vortex defects, optical retardation birefringence (Michel-Levy colors),
// electro-hydrodynamic convection rolls, and polarized photo texturing.
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

uniform float defectP;
uniform float retardP;
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

// Michel-Levy birefringence optical retardation color map
vec3 michelLevy(float delta) {
    // Interference orders under crossed polarizers
    float r = sin(delta * 4.0 - 0.2) * 0.5 + 0.5;
    float g = sin(delta * 4.0 - 1.5) * 0.5 + 0.5;
    float b = sin(delta * 4.0 - 2.8) * 0.5 + 0.5;
    return vec3(r, g, b) * (1.0 + 0.4 * sin(delta * 12.0));
}

void main() {
    float def = (defectP > 0.0) ? defectP : 1.0;
    float ret = (retardP > 0.0) ? retardP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.2;

    // Multi-center topological disclination defects (strength s = +1/2, -1/2, +1)
    vec2 d1 = uv - vec2(sin(t * 0.5) * 0.4, cos(t * 0.4) * 0.3);
    vec2 d2 = uv - vec2(cos(t * 0.6 + 2.0) * 0.45, sin(t * 0.7 + 1.0) * 0.35);
    vec2 d3 = uv - vec2(sin(t * 0.3 + 4.0) * 0.5, cos(t * 0.5 + 3.0) * 0.4);

    float a1 = atan(d1.y, d1.x) * 0.5; // s = +1/2
    float a2 = -atan(d2.y, d2.x) * 0.5; // s = -1/2
    float a3 = atan(d3.y, d3.x) * 1.0; // s = +1

    // Combined molecular director angle theta(x, y)
    float theta = a1 + a2 + a3 + uv.x * 2.0 + uv.y * 1.5 + audioPhase * 0.3;

    // Electro-hydrodynamic Williams convection rolls
    float rolls = sin(uv.x * 24.0 + sin(uv.y * 12.0 + t) * 2.0) * (0.3 + 0.4 * audioBass);
    theta += rolls * def;

    // Cross-polarizer transmission intensity: I = I0 * sin^2(2*theta) * sin^2(pi*delta / lambda)
    float analyzerAngle = time * 0.15 + audioPhase * 0.1;
    float extinction = pow(sin(2.0 * (theta - analyzerAngle)), 2.0);

    // Optical path retardation delta
    float delta = (length(uv) * 2.5 + sin(theta * 3.0) * 0.8 + audioSwell * 0.6) * ret;
    vec3 birefCol = michelLevy(delta);

    // Polarized dual-axis photo sampling (ordinary and extraordinary rays)
    vec2 ordUV = uv + vec2(cos(theta), sin(theta)) * (0.02 + 0.03 * audioKick);
    vec2 extUV = uv - vec2(sin(theta), cos(theta)) * (0.02 + 0.03 * audioKick);
    vec3 photoOrd = img(fract(ordUV + 0.5));
    vec3 photoExt = img(fract(extUV + 0.5));
    vec3 photoBiref = mix(photoOrd, photoExt, extinction);

    // Topological Schlieren dark brushes where director aligns with polarizers
    vec3 col = photoBiref * birefCol * (extinction * 1.8 + 0.15);

    // Defect core bright flashes on kicks
    float core1 = exp(-dot(d1, d1) * 40.0);
    float core2 = exp(-dot(d2, d2) * 40.0);
    float core3 = exp(-dot(d3, d3) * 40.0);
    float defectGlow = (core1 + core2 + core3) * (1.0 + 3.0 * audioKick);
    col += vec3(1.0, 0.9, 0.7) * defectGlow * 1.5;

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9)); // Saturation boost
    col += vec3(0.04, 0.02, 0.06) * audioSwell;

    fragColor = vec4(col, 1.0);
}
