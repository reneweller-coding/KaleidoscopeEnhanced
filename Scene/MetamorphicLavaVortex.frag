#version 330 core
out vec4 fragColor;
// MetamorphicLavaVortex.frag
// -----------------------------------------------------------------------
// METAMORPHIC LAVA VORTEX: 100% viewport-filling viscous basalt magma
// ocean. Solidified black obsidian crust plates drift, fracture, and submerge
// into glowing 1500°C molten lava rivers, with convective heat shimmer,
// incandescent fault cracks, and volcanic photo texture advection.
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

uniform float magmaP;
uniform float crustP;
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

float voronoiPlates(vec2 p, out vec2 center) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float m = 8.0;
    vec2 mCenter = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + vec2(11.2, 37.8)));
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < m) {
                m = d;
                mCenter = n + g + o;
            }
        }
    }
    center = mCenter;
    return sqrt(m);
}

void main() {
    float mag = (magmaP > 0.0) ? magmaP : 1.0;
    float crs = (crustP > 0.0) ? crustP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.15;

    // Magma convective vortex advection
    vec2 vortexCenter = vec2(sin(t * 0.5) * 0.3, cos(t * 0.4) * 0.25);
    vec2 dV = uv - vortexCenter;
    float rV = length(dV);
    float swirl = exp(-rV * 2.5) * (2.5 + 1.5 * audioBass);
    vec2 warpedUV = uv + vec2(-dV.y, dV.x) * (swirl * 0.1);

    // Voronoi obsidian crust plates
    vec2 plateCenter;
    float plateDist = voronoiPlates(warpedUV * 5.0 * crs + vec2(t * 0.2, t * 0.1), plateCenter);
    float faultLine = smoothstep(0.12, 0.0, plateDist); // 1 in fault, 0 on crust

    // Heat shimmer turbulence
    float heatTurb = sin(warpedUV.x * 20.0 + time * 6.0) * cos(warpedUV.y * 20.0 + time * 5.0);
    vec2 photoUV = plateCenter * 0.15 + warpedUV * 0.4 + vec2(heatTurb * 0.015);
    vec3 photoObsidian = img(fract(photoUV));

    // Lava temperatures: 1500°C White-Hot Molten Core, 1000°C Yellow/Orange, 700°C Cherry Red, Black Obsidian
    vec3 lavaWhite  = vec3(1.0, 0.98, 0.90) * 3.5;
    vec3 lavaYellow = vec3(1.0, 0.75, 0.15) * 2.5;
    vec3 lavaRed    = vec3(1.0, 0.15, 0.02) * 2.0;
    vec3 obsidianCrust = mix(vec3(0.04, 0.05, 0.06), vec3(0.15, 0.12, 0.10), photoObsidian.r) * photoObsidian;

    // Molten fault line coloring
    vec3 faultMagma = mix(lavaRed, lavaYellow, smoothstep(0.4, 0.8, faultLine));
    faultMagma = mix(faultMagma, lavaWhite, smoothstep(0.8, 1.0, faultLine));

    // Volcanic eruption flash on kick
    float eruptionFlash = faultLine * (audioKick * 2.8 + audioSubBass * 1.5) * mag;

    // Shading composition
    vec3 col = mix(obsidianCrust, faultMagma, faultLine);
    col += lavaWhite * eruptionFlash;

    // Convective magma surface glow
    float coreGlow = exp(-rV * 2.0) * (0.4 + 0.6 * audioSwell);
    col += vec3(1.0, 0.4, 0.05) * coreGlow;

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.88));

    fragColor = vec4(col, 1.0);
}
