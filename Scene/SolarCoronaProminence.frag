#version 330 core
out vec4 fragColor;
// SolarCoronaProminence.frag
// -----------------------------------------------------------------------
// SOLAR CORONA PROMINENCE: Volumetric solar magnetic coronal loops arching
// over a boiling photospheric convection surface with explosive magnetic
// reconnection flares, EUV thermal glow, and plasma filament turbulence.
//   audioAdvance -> drives photospheric granulation convection flow
//   audioKick    -> triggers coronal mass ejections & explosive flare flashes
//   audioBass    -> undulates magnetic coronal loop arch heights
//   audioSwell   -> widens thermal plasma glow & ionization layers
//
// Per-activation variety:
//   loopP    float coronal loop density & arch height      (0.5..2.2)
//   granuleP float photospheric convection cell size        (0.5..2.0)
//   flareP   float magnetic reconnection flare brightness  (0.5..2.2)
//   hueP     float EUV/H-alpha chromatic temperature shift (0..6.28)
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
uniform float flareP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// 2D Noise helper
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float voronoiGranules(vec2 uv) {
    vec2 g = floor(uv);
    vec2 f = fract(uv);
    float minDist = 1.0;
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            vec2 lattice = vec2(float(x), float(y));
            vec2 offset = vec2(hash21(g + lattice), hash21(g + lattice + 15.7));
            vec2 d = lattice + offset - f;
            minDist = min(minDist, length(d));
        }
    }
    return minDist;
}

void main() {
    float lp  = (loopP    > 0.0) ? loopP    : 1.0;
    float grn = (granuleP > 0.0) ? granuleP : 1.0;
    float flr = (flareP   > 0.0) ? flareP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 + audioAdvance * 0.18;

    // Convective solar granules background
    vec2 granCoord = uv * 9.0 * grn + vec2(sin(t * 0.5), cos(t * 0.4)) * 0.5;
    float gran = voronoiGranules(granCoord);
    float granuleLuminance = smoothstep(0.05, 0.45, gran) * (1.0 + 0.3 * audioMid);

    // Magnetic coronal loop arcs (parabolic / catenary magnetic field lines)
    float loopAccum = 0.0;
    float loopCount = 6.0;
    for (float i = 0.0; i < loopCount; ++i) {
        float xOffset = (i - loopCount * 0.5) * 0.35;
        float archHeight = (0.45 + 0.25 * sin(i * 1.7 + t)) * lp + audioBass * 0.3;
        
        // Parabolic loop equation: y = archHeight - ((x - xOffset)^2 / width)
        float loopWidth = 0.22 + 0.1 * i;
        float targetY = archHeight - pow((uv.x - xOffset) / loopWidth, 2.0) * 1.5;
        float distToLoop = abs(uv.y - targetY);

        // Twisted helical plasma braids inside loop
        float helix = sin(uv.x * 25.0 + t * 5.0 + i * 2.0) * 0.02;
        distToLoop = abs(uv.y - (targetY + helix));

        float loopGlow = exp(-distToLoop * 35.0) * (0.8 + 0.4 * sin(uv.x * 12.0 - t * 4.0));
        loopAccum += loopGlow;
    }

    // Magnetic reconnection apex flare on beat
    vec2 flareCenter = vec2(sin(t * 1.2) * 0.2, 0.35 * lp);
    float flareDist = length(uv - flareCenter);
    float flare = exp(-flareDist * 18.0) * (audioKick * 3.5 * flr + audioSubBass * 1.2);

    // Photo texture mapping warped by magnetic convection
    vec2 photoUV = st + vec2(sin(uv.y * 8.0 + t), cos(uv.x * 8.0 - t)) * 0.04 * (1.0 + audioKick * 0.8);
    vec3 photo = img(fract(photoUV));

    // EUV & H-alpha solar palette (deep crimson, solar gold, ionized violet-white)
    vec3 granColor = mix(vec3(0.9, 0.3, 0.05), vec3(1.0, 0.85, 0.3), granuleLuminance);
    vec3 loopColor = mix(vec3(1.0, 0.2, 0.5), vec3(1.0, 0.95, 0.7), loopAccum * 0.4);

    vec3 col = mix(photo * 0.8, granColor, 0.45 + 0.2 * audioLevel);
    col += loopAccum * loopColor * (1.0 + audioSwell * 0.8);
    col += flare * vec3(1.0, 0.98, 0.85) * 1.8;

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.3, 0.4, length(uv));
    col *= vig;

    fragColor = vec4(col, 1.0);
}
