#version 330 core
out vec4 fragColor;
// SuperheatedCoronalLoop.frag
// -----------------------------------------------------------------------
// SUPERHEATED CORONAL LOOP: 100% viewport-filling volumetric view of
// solar coronal magnetic loops anchored in boiling photospheric convection
// granules. Explosive magnetic reconnection flares, high-temperature
// plasma fountains, coronal rain, and solar photo granulation.
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

uniform float loopP;
uniform float granuleP;
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

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

float voronoiGranules(vec2 x) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float m = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + vec2(17.1, 43.7)));
            vec2 r = g + o - f;
            float d = dot(r, r);
            m = min(m, d);
        }
    }
    return sqrt(m);
}

void main() {
    float lp  = (loopP    > 0.0) ? loopP    : 1.0;
    float grn = (granuleP > 0.0) ? granuleP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Photospheric convection granulation
    vec2 granuleCoord = uv * 10.0 * grn + vec2(sin(t * 0.2), cos(t * 0.15)) * 0.5;
    float vGran = voronoiGranules(granuleCoord);
    float granuleCenter = smoothstep(0.4, 0.0, vGran); // Hot bright centers
    float granuleLanes = smoothstep(0.0, 0.25, vGran); // Cooler dark intergranular lanes

    // Coronal magnetic loops (arches spanning the canvas)
    float loopArch1 = uv.y - (0.4 - pow(uv.x * 1.5, 2.0)) + 0.1 * sin(uv.x * 12.0 + t * 2.0);
    float loopArch2 = uv.y - (0.6 - pow((uv.x - 0.3) * 1.8, 2.0)) + 0.08 * cos(uv.x * 14.0 - t * 3.0);
    float loopArch3 = uv.y - (0.5 - pow((uv.x + 0.35) * 1.6, 2.0)) + 0.09 * sin(uv.x * 10.0 + t);

    float loop1 = exp(-abs(loopArch1) * 20.0);
    float loop2 = exp(-abs(loopArch2) * 25.0);
    float loop3 = exp(-abs(loopArch3) * 22.0);
    float totalLoops = (loop1 + loop2 + loop3) * lp;

    // Relativistic magnetic reconnection snap on kicks
    float reconnectSnap = exp(-abs(uv.x) * 15.0) * exp(-abs(uv.y - 0.4) * 15.0);
    float flareFlash = reconnectSnap * (audioKick * 3.0 + audioSubBass * 1.5);

    // Plasma flow along magnetic loops
    float plasmaFlow = sin(uv.x * 30.0 - time * 12.0) * 0.5 + 0.5;

    // Photo texture embedded into boiling solar granulation
    vec2 photoUV = uv * 0.4 + vec2(0.5) + vec2(cos(t * 0.1), sin(t * 0.15)) * 0.05;
    vec3 photoSolar = img(fract(photoUV));

    // Solar colors: 6000K Photosphere Gold, 2M Kelvin Coronal Cyan/Violet, Blinding Flare White
    vec3 photoBase = mix(vec3(1.0, 0.45, 0.05), vec3(1.0, 0.85, 0.25), granuleCenter) * photoSolar;
    vec3 loopPlasma = mix(vec3(1.0, 0.2, 0.05), vec3(0.3, 0.8, 1.0), plasmaFlow);
    vec3 flareWhite = vec3(1.0, 0.98, 0.92) * 3.0;

    vec3 col = photoBase * (0.8 + 0.5 * audioBass);
    col += loopPlasma * totalLoops * (1.2 + 1.5 * audioHigh);
    col += flareWhite * flareFlash;

    // Solar limb darkening & corona glow
    float coronaGlow = exp(-length(uv) * 2.0) * (0.4 + 0.6 * audioSwell);
    col += vec3(1.0, 0.6, 0.1) * coronaGlow;

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.85));

    fragColor = vec4(col, 1.0);
}
