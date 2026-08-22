#version 330 core
out vec4 fragColor;
/**
 * @file TerraformingColony.frag
 * @brief TERRAFORMING COLONY: A flight over a harsh, barren planet being transformed.
 * Massive glowing biodomes and towering atmospheric processors dominate the 
 * landscape. Smoke and terraforming gases glow intensely to the beat.
 *   audioAdvance -> camera flight speed over the colony
 *   audioKick    -> flashes from atmospheric processors and vent stacks
 *   audioSwell   -> brightness of the biodomes and artificial daylight
 *   audioChromaHue-> palette offset for the terraforming gases
 *
 * Per-activation variety:
 *   domeP float density of biodomes (0.5..1.5)
 *   gasP float density of atmospheric gases (0.5..1.5)
 *   hueP float palette offset (0..6.28)
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

uniform float domeP;
uniform float gasP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 4; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float hitMat = 0.0;
float hitGlow = 0.0;

float map(vec3 p, float dp)
{
    float d = 1e10;
    float mat = 0.0;
    float glow = 0.0;
    
    // Terrain base
    float ground = p.y + 1.0;
    ground -= fbm(p * 0.2) * 1.5;
    
    if (ground < d) { d = ground; mat = 1.0; }
    
    // Grid of biodomes and processors
    vec3 gridP = p;
    vec2 id = floor(gridP.xz / 8.0);   // was vec3 (type error) -- this is a 2D grid-cell index
    vec3 q = p;
    q.xz = mod(q.xz, 8.0) - 4.0;
    
    float h = hash21(id);
    
    // Align structures to ground height
    float localH = fbm(vec3(floor(p.xz / 8.0) * 8.0, 0.0) * 0.2) * 1.5 - 1.0;
    q.y -= localH;
    
    if (h < 0.4 * dp) {
        // Biodome
        float r = 2.5 + hash21(id + 1.0);
        float dome = length(q) - r;
        
        // Flatten bottom
        dome = max(dome, -q.y);
        
        if (dome < d) { d = dome; mat = 2.0; glow = 1.0; }
    } 
    else if (h > 0.8) {
        // Processor tower
        float hTow = 3.0 + hash21(id + 2.0) * 3.0;
        float tow = sdBox(q, vec3(1.0, hTow, 1.0));
        
        // Vent at top
        float vent = sdBox(q - vec3(0.0, hTow, 0.0), vec3(0.5, 1.0, 0.5));
        tow = max(tow, -vent);
        
        if (tow < d) { d = tow; mat = 3.0; glow = step(hTow - 0.5, q.y); }
    }
    
    hitMat = mat;
    hitGlow = glow;
    return d;
}

vec3 calcNormal(vec3 p, float dp)
{
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(
        map(p + e.xyy, dp) - map(p - e.xyy, dp),
        map(p + e.yxy, dp) - map(p - e.yxy, dp),
        map(p + e.yyx, dp) - map(p - e.yyx, dp)));
}

void main()
{
    float dp = (domeP > 0.01 ? domeP : 1.0);
    float gp = (gasP > 0.01 ? gasP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 5.0 + audioAdvance * 15.0;
    
    vec3 ro = vec3(0.0, 6.0 + 2.0 * sin(time * 0.2), drift);
    vec3 ta = ro + vec3(0.0, -0.3, 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.05 * sin(time * 0.1);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    float g = 0.0;
    int steps = 0;
    
    for (int i = 0; i < 90; ++i) {
        p = ro + rd * d;
        float ds = map(p, dp);
        m = hitMat;
        g = hitGlow;
        steps = i;
        if (ds < 0.01 * (1.0 + d * 0.05)) break;
        d += ds * 0.75;
        if (d > 120.0) { m = 0.0; break; }
    }

    vec3 col = vec3(0.1, 0.1, 0.12); // polluted, dark sky
    
    vec3 sunDir = normalize(vec3(-0.5, 0.3, 0.8));
    vec3 sunCol = vec3(0.8, 0.5, 0.3); // muted sun
    
    vec3 domeColor = imgPalette(0.4);
    vec3 ventColor = imgPalette(0.8 + 0.1 * audioKick);

    if (m > 0.5) {
        vec3 n = calcNormal(p, dp);
        float dif = max(dot(n, sunDir), 0.0);
        float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
        
        vec3 albedo;
        if (m == 1.0) {
            albedo = vec3(0.3, 0.25, 0.2); // barren rust/dirt
            albedo *= 0.8 + 0.2 * fbm(p * 2.0);
        } else if (m == 2.0) {
            albedo = vec3(0.1, 0.3, 0.15); // interior bio-matter seen through glass
        } else {
            albedo = vec3(0.2); // tech metal
        }
        
        col = albedo * (0.05 + dif * sunCol);
        col += albedo * fill * 0.1;
        
        if (m == 2.0 && g > 0.5) {
            // Biodome glass glow
            float hex = step(0.8, hash21(floor(p.xz * 2.0)));
            col += domeColor * (0.5 + audioSwell * 0.5) * hex * 2.0;
            
            // Specular on glass
            float spec = pow(max(dot(reflect(-sunDir, n), -rd), 0.0), 32.0);
            col += sunCol * spec;
        } 
        else if (m == 3.0 && g > 0.5) {
            // Processor vent flash
            float flash = step(0.9, fract(time * 2.0 + p.x));
            col += ventColor * (flash + audioKick * 2.0) * 3.0;
        }
        
        col *= clamp(1.0 - float(steps) * 0.015, 0.1, 1.0);
    }
    
    // Terraforming gases (volumetric fog)
    float gasDens = fbm(p * 0.1 + vec3(time * 0.1, 0.0, 0.0)) * exp(-max(p.y, 0.0) * 0.2);
    gasDens = clamp(gasDens * gp, 0.0, 1.0);
    
    vec3 gasCol = mix(vec3(0.2, 0.3, 0.2), ventColor, 0.3); // poisonous green / vent mix
    
    // Distance fog
    float distFog = exp(-d * 0.02);
    
    col = mix(gasCol * (0.5 + audioSwell), col, 1.0 - gasDens * (1.0 - distFog));
    col = mix(vec3(0.05, 0.05, 0.06), col, distFog);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
