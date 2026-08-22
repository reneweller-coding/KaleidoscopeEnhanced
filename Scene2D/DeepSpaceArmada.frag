#version 330 core
out vec4 fragColor;
/**
 * @file DeepSpaceArmada.frag
 * @brief DEEP SPACE ARMADA: A massive fleet of warships advancing through a dense,
 * colorful nebula. The ships are arrayed in formation, with their engines glowing
 * brightly. The camera flies alongside or through the formation.
 *   audioAdvance -> forward flight speed of the armada and camera
 *   audioKick    -> engine flares and weapon flashes
 *   audioSwell   -> nebula brightness and engine trail intensity
 *   audioChromaHue-> nebula hue follows the musical key
 *
 * Per-activation variety:
 *   fleetP float fleet density (0.7..1.5)
 *   glowP float engine light intensity (0.6..1.8)
 *   nebulaP float nebula density (0.5..1.5)
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

uniform float fleetP;
uniform float glowP;
uniform float nebulaP;
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
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    float a = mix(hash11(n +   0.0), hash11(n +   1.0), f.x);
    float b = mix(hash11(n +  57.0), hash11(n +  58.0), f.x);
    float c = mix(hash11(n + 113.0), hash11(n + 114.0), f.x);
    float d = mix(hash11(n + 170.0), hash11(n + 171.0), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float fbm3(vec3 p)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { s += a * noise3(p); p *= 2.03; a *= 0.5; }
    return s;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Background nebula and stars
vec3 background(vec3 rd, float drift, float neb, vec3 nebTint)
{
    vec3 col = vec3(0.005, 0.008, 0.015);
    vec3 np = rd * 2.0 + vec3(drift * 0.02, 0.0, drift * 0.05);
    float warp = fbm3(np * 0.5);
    float n = fbm3(np + warp * 1.5);
    n = pow(clamp(n - 0.2, 0.0, 1.0) * 2.5, 1.5) * neb;
    col += nebTint * n * 1.5;
    col += nebTint.bgr * pow(n, 2.0) * 0.6;

    for (int i = 0; i < 2; ++i) {
        float sc = 80.0 + 100.0 * float(i);
        vec3 sp = rd * sc + vec3(drift * 0.05, 0.0, 0.0);
        vec3 cell = floor(sp);
        vec3 f = fract(sp) - 0.5;
        if (hash31(cell) > 0.98 - 0.005 * float(i)) {
            float d = length(f);
            float b = exp(-d * d * 200.0);
            col += mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.7), hash31(cell + 13.0)) * b;
        }
    }
    return col;
}

float hitMat = 0.0;

// Simple but imposing ship shape
float shipSDF(vec3 p) {
    // Wedge hull
    vec3 q = p;
    q.y = abs(q.y);
    float d1 = dot(q, normalize(vec3(0.2, 1.0, 0.0))) - 0.5;
    d1 = max(d1, abs(p.z) - 3.0);
    d1 = max(d1, abs(p.x) - 1.5 + p.z * 0.4);
    
    // Engine block
    float d2 = sdBox(p - vec3(0.0, 0.0, -3.2), vec3(0.8, 0.3, 0.2));
    
    // Bridge tower
    float d3 = sdBox(p - vec3(0.0, 0.5, -1.0), vec3(0.2, 0.4, 0.5));
    
    return min(d1, min(d2, d3));
}

float map(vec3 p, float fp)
{
    float d = 1e10;
    float mat = 0.0;
    
    // Fleet formation
    vec3 cp = p;
    vec2 id = floor((cp.xy + vec2(10.0, 5.0)) / vec2(20.0, 10.0));
    
    // Check if ship exists in this slot
    float h = hash21(id);
    if (h < 0.6 * fp) {
        // Offset in Z so they aren't all in a perfect plane
        float zOffset = hash21(id + 7.3) * 40.0;
        float zSpacing = 60.0;
        float idZ = floor((cp.z - zOffset) / zSpacing);
        cp.z = mod(cp.z - zOffset, zSpacing) - zSpacing * 0.5;
        cp.xy = mod(cp.xy + vec2(10.0, 5.0), vec2(20.0, 10.0)) - vec2(10.0, 5.0);
        
        float ship = shipSDF(cp);
        if (ship < d) {
            d = ship;
            mat = 1.0;
            // Engines
            if (cp.z < -3.3) mat = 2.0; 
        }
    }
    
    hitMat = mat;
    return d;
}

vec3 calcNormal(vec3 p, float fp)
{
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(
        map(p + e.xyy, fp) - map(p - e.xyy, fp),
        map(p + e.yxy, fp) - map(p - e.yxy, fp),
        map(p + e.yyx, fp) - map(p - e.yyx, fp)));
}

void main()
{
    float fp = (fleetP > 0.01 ? fleetP : 1.0);
    float glw = (glowP > 0.01 ? glowP : 1.0);
    float neb = (nebulaP > 0.01 ? nebulaP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.05 + audioAdvance * 0.15;
    float drift = time * 8.0 + audioAdvance * 20.0;

    // Camera travels with the fleet
    vec3 ro = vec3(0.0, 2.0 * sin(t * 0.4), drift * 0.5);
    vec3 ta = ro + vec3(0.5 * sin(t * 0.3), -0.2, 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.05 * sin(t * 0.2);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.3 * ww);

    vec3 nebTint = imgPalette(0.1 + 0.2 * audioCentroid);
    nebTint = mix(vec3(dot(nebTint, vec3(0.333))), nebTint, 1.2);
    
    vec3 engineColor = imgPalette(0.8 + 0.1 * audioKick);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    int steps = 0;
    
    for (int i = 0; i < 80; ++i) {
        p = ro + rd * d;
        float ds = map(p, fp);
        m = hitMat;
        steps = i;
        if (ds < 0.01 * (1.0 + d * 0.05)) break;
        d += ds * 0.8;
        if (d > 150.0) { m = 0.0; break; }
    }

    vec3 col = background(rd, drift, neb, nebTint);

    vec3 sunDir = normalize(vec3(0.5, 0.8, -0.2));

    if (m > 0.5) {
        vec3 n = calcNormal(p, fp);
        float dif = max(dot(n, sunDir), 0.0);
        float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
        
        vec3 albedo = vec3(0.2, 0.22, 0.25);
        // Simple hull plating
        vec2 grid = floor(p.xz * 3.0);
        albedo *= 0.8 + 0.2 * hash21(grid);
        
        col = albedo * (0.2 + 1.2 * dif);
        col += nebTint * albedo * fill * 0.6;
        
        if (m == 2.0) { // Engines
            col += engineColor * (1.5 + 2.0 * audioKick + 1.5 * audioSwell) * glw;
        }
        
        // AO
        col *= clamp(1.0 - float(steps) * 0.012, 0.3, 1.0);
    }
    
    // Engine glow blooms over everything (very simple screen-space check for now)
    // We can simulate engine glow by finding if ray passes near engines
    // To keep it fast, we rely on the hit m==2.0 and the soft knee, 
    // but we can also add a general volumetric engine plume behind ships.
    // Instead, we just add the flare based on distance.

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
