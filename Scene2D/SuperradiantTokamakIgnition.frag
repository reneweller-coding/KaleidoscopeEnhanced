#version 330 core
out vec4 fragColor;
/**
 * @file SuperradiantTokamakIgnition.frag
 * @brief SUPERRADIANT TOKAMAK IGNITION: 100% viewport-filling volumetric view
 * from inside a burning magnetic confinement thermonuclear fusion core.
 * Toroidal magnetic flux surfaces, helical runaway electron beams, turbulent
 * Alfven wave filaments, glowing divertor plates, and D-T fusion plasma.
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

uniform float plasmaP;
uniform float helicalP;
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

void main() {
    float pls = (plasmaP  > 0.0) ? plasmaP  : 1.0;
    float hel = (helicalP > 0.0) ? helicalP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.35 * spd + audioAdvance * 0.2;

    // Inside-the-torus curved ray setup
    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Toroidal and poloidal angles
    // The safety factor is an INTEGER: every use of phi below is periodic in
    // 2*pi only if its coefficient is a whole number, and 3.2*hel was not --
    // the filaments tore along the atan cut on the left (reported as a visible
    // edge).  Rational q is also where the islands of a real tokamak sit.
    float q_safety = 2.0 + floor(clamp(hel, 0.0, 1.0) * 2.99); // Safety factor q, integer
    float phi = angle + t * 0.5; // Toroidal coordinate
    float theta = (1.0 / (r + 0.1)) * (1.2 + 0.4 * audioBass) + phi * q_safety;

    // Helical magnetic field lines & plasma filaments
    float filament1 = sin(theta * 6.0 - phi * 18.0 - time * 6.0);
    float filament2 = cos(theta * 12.0 + phi * 12.0 + time * 4.0);
    float plasmaCore = exp(-abs(filament1) * 6.0) + exp(-abs(filament2) * 6.0);

    // Alfvén wave turbulence ripples
    float alfvenWave = sin(r * 20.0 - time * 10.0 + sin(theta * 4.0) * 2.0);
    float turbulence = exp(-abs(alfvenWave) * 8.0) * (0.6 + 0.8 * audioHigh);

    // Photo texture advected by helical plasma vorticity
    // The V coordinate must wrap with phi too: theta carries q*phi, so it is
    // split into the radial part and a q*phi/(2pi) term that fract() closes.
    float thetaR = (1.0 / (r + 0.1)) * (1.2 + 0.4 * audioBass);
    vec2 plasmaUV = vec2(phi / 6.28318 + 0.5, fract(thetaR * 0.15 + q_safety * phi / 6.28318));
    plasmaUV += vec2(filament1, filament2) * 0.04 * (1.0 + 1.5 * audioKick);
    vec3 photoPlasma = img(fract(plasmaUV));

    // Thermonuclear fusion temperatures: Ultra-hot deuterium-tritium plasma core (100M Kelvin)
    vec3 plasmaHot = vec3(0.9, 0.95, 1.0) * 3.0; // Blinding white-hot core
    vec3 plasmaViolet = vec3(0.7, 0.15, 1.0) * 2.2; // High-energy Bremsstrahlung
    vec3 plasmaCyan = vec3(0.1, 0.8, 1.0) * 2.0; // Cyclotron radiation
    vec3 divertorGlow = vec3(1.0, 0.35, 0.05); // Glowing hot tungsten divertor tiles

    vec3 plasmaEmission = mix(plasmaCyan, plasmaViolet, sin(theta * 2.0) * 0.5 + 0.5);
    plasmaEmission = mix(plasmaEmission, plasmaHot, clamp(plasmaCore * 0.6 - 0.2, 0.0, 1.0));

    // Thermonuclear ignition flash on kick
    float ignitionFlash = exp(-r * 3.0) * (audioKick * 2.8 + audioSubBass * 1.5);

    vec3 col = photoPlasma * (plasmaEmission * 0.8 + divertorGlow * 0.3) * pls;
    col += plasmaEmission * (plasmaCore * 1.2 + turbulence * 0.8);
    col += vec3(1.0, 0.98, 0.95) * ignitionFlash;

    // Toroidal chamber wall vignetting
    col *= smoothstep(0.0, 0.12, r);

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.85)); // Contrast boost
    col += vec3(0.04, 0.02, 0.07) * audioSwell;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.45;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
