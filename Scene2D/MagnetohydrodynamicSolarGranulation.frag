#version 330 core
out vec4 fragColor;
/**
 * @file MagnetohydrodynamicSolarGranulation.frag
 * @brief MAGNETOHYDRODYNAMIC SOLAR GRANULATION: Solar photosphere turbulent thermal convection.
 * Rising hot plasma plumes form bright polygonal convective granules, sinking dark intergranular
 * magnetic lanes, high-frequency acoustic p-mode waves, and magnetic micro-flare brightenings.
 *   audioAdvance -> drives turbulent plasma convective turnover velocity
 *   audioKick    -> ignites explosive magnetic reconnection micro-flares in lanes
 *   audioBass    -> undulates deep sub-photospheric convection cell expansion
 *   audioSwell   -> brightens hot plasma granule core thermal radiation
 *   audioCentroid-> shifts photospheric blackbody radiation color temperature
 *
 * Per-activation variety:
 *   granuleScaleP float Voronoi convection cell packing density (2.0..6.0)
 *   laneWidthP    float intergranular magnetic lane width       (0.6..2.2)
 *   flareP        float magnetic micro-flare burst brightness   (0.8..2.5)
 *   pmodeP        float acoustic p-mode oscillation amplitude   (0.4..1.8)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float granuleScaleP;
uniform float laneWidthP;
uniform float flareP;
uniform float pmodeP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// 2D Voronoi cell with F1 and F2 distances
vec3 voronoi(vec2 p, float t) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float m_dist = 8.0;
    float m_dist2 = 8.0;
    vec2 m_point = vec2(0.0);
    
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash2(n + g);
            o = 0.5 + 0.4 * sin(t * 0.5 + 6.2831 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < m_dist) {
                m_dist2 = m_dist;
                m_dist = d;
                m_point = r;
            } else if (d < m_dist2) {
                m_dist2 = d;
            }
        }
    }
    return vec3(sqrt(m_dist), sqrt(m_dist2), length(m_point));
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.35 + audioAdvance * 0.35;
    
    float scale = (granuleScaleP > 0.01 ? granuleScaleP : 3.8);
    vec2 p = uv * scale;
    
    // Photospheric acoustic p-mode waves
    float pmode = sin(p.x * 6.0 + p.y * 5.0 - t * 3.0) * (pmodeP > 0.01 ? pmodeP : 0.8) * 0.15;
    p += pmode * (0.5 + 0.5 * audioMid);
    
    // Multi-scale Voronoi granulation
    vec3 v1 = voronoi(p, t);
    vec3 v2 = voronoi(p * 2.2 + 5.0, t * 1.3);
    
    // Convective granule profile: convex dome inside cell, steep drop at lanes
    float d1 = v1.x;
    float d2 = v1.y;
    float laneWidth = (laneWidthP > 0.01 ? laneWidthP : 1.2);
    float lane = clamp((d2 - d1) * (4.0 / laneWidth), 0.0, 1.0);
    
    // Hot rising granule center vs cold sinking intergranular lanes
    float granuleHeat = sqrt(max(0.001, 1.0 - d1 * 2.0)) * lane;
    granuleHeat += (1.0 - v2.x) * 0.25; // Sub-granular detail
    
    // Magnetic micro-flares localized in intergranular lanes
    float flareActive = (1.0 - lane) * (flareP > 0.01 ? flareP : 1.5);
    float microFlare = pow(flareActive, 4.0) * (1.0 + 4.0 * audioKick);
    
    // Color synthesis: Incandescent solar plasma identity tinted with photo palette
    vec3 hotPlasma = vec3(1.0, 0.9, 0.6);
    vec3 amberLobe = vec3(1.0, 0.45, 0.05);
    vec3 darkLane  = vec3(0.12, 0.03, 0.01);
    
    vec3 plasmaCol = palTint(mix(amberLobe, hotPlasma, granuleHeat), granuleHeat * 0.3, 0.25);
    vec3 laneCol   = palTint(darkLane, 0.1, 0.2);
    vec3 flareCol  = palTint(vec3(0.9, 0.95, 1.0), audioCentroid, 0.22);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += mix(laneCol, plasmaCol, lane) * (0.85 + 0.45 * audioSwell);
    col += flareCol * microFlare * 2.5;
    col += plasmaCol * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
