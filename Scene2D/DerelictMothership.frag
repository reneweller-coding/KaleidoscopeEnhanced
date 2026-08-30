#version 330 core
out vec4 fragColor;
/**
 * @file DerelictMothership.frag
 * @brief DERELICT MOTHERSHIP: An enormous, heavily damaged alien vessel drifting
 * silently in the void. Its hull is breached, and its remaining lights flicker 
 * weakly and erratically. The atmosphere is eerie and mysterious.
 *   audioAdvance -> slow drift of the ship and camera movement
 *   audioKick    -> erratic flickering of the surviving power grid
 *   audioSwell   -> ambient fog and debris scattering
 *   audioChromaHue-> palette offset for the eerie lighting
 *
 * Per-activation variety:
 *   hullP float ship size / how much frame it takes (0.7..1.6)
 *   glowP float intensity of the flickering lights (0.6..1.8)
 *   debrisP float amount of floating debris (0.5..1.5)
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

uniform float hullP;
uniform float glowP;
uniform float debrisP;
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

float sdCyl(vec3 p, float h, float r) {
    vec2 d = vec2(length(p.xy) - r, abs(p.z) - h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float hitMat = 0.0;

// The derelict ship
float map(vec3 p, float len)
{
    float d = 1e10;
    float mat = 0.0;
    
    // Core hull (asymmetric, chunky)
    float tp = 1.0 - 0.4 * smoothstep(0.0, len, p.z);
    float hull = sdBox(p, vec3(3.0 * tp, 1.5 * tp, len)) - 0.5;
    
    // Large breaches and damage (subtracted noise/spheres)
    float damage = fbm3(p * 0.4) * 2.5;
    hull = max(hull, -(damage - 1.0)); // subtract where damage is high
    
    // Struts and ribbing exposed by damage
    vec3 rp = p;
    rp.z = mod(rp.z, 2.0) - 1.0;
    float ribs = sdBox(rp, vec3(3.5 * tp, 1.8 * tp, 0.2));
    ribs = max(ribs, sdBox(p, vec3(3.5 * tp, 1.8 * tp, len))); // bounding box
    
    // We combine the hull and ribs
    float ship = min(hull, ribs);
    
    // Add some random antennas / spires that are broken
    vec3 sp = p;
    sp.x = mod(sp.x + 1.0, 2.0) - 1.0;
    float spires = sdCyl(sp.xzy - vec3(0.0, 0.0, 1.5), 1.0, 0.1);
    spires = max(spires, sdBox(p, vec3(3.0 * tp, 3.0, len)));
    
    ship = min(ship, spires);
    
    if (ship < d) { d = ship; mat = 1.0; }
    
    hitMat = mat;
    return d;
}

vec3 calcNormal(vec3 p, float len)
{
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(
        map(p + e.xyy, len) - map(p - e.xyy, len),
        map(p + e.yxy, len) - map(p - e.yxy, len),
        map(p + e.yyx, len) - map(p - e.yyx, len)));
}

// Deep space background with debris
vec3 background(vec3 rd, float drift, float dbr, vec3 tint)
{
    vec3 col = vec3(0.012, 0.015, 0.02);
    
    // Sparse, dark nebula
    vec3 np = rd * 1.5 + vec3(drift * 0.01, 0.0, drift * 0.02);
    float n = fbm3(np);
    n = pow(clamp(n - 0.3, 0.0, 1.0) * 2.0, 2.0);
    col += tint * n * 0.5;

    // Small debris floating
    for (int i = 0; i < 2; ++i) {
        float sc = 20.0 + 30.0 * float(i);
        vec3 sp = rd * sc + vec3(drift * 0.1, drift * 0.05, 0.0);
        vec3 cell = floor(sp);
        vec3 f = fract(sp) - 0.5;
        if (hash31(cell) > 0.95 - 0.01 * float(i) * dbr) {
            float d = length(f);
            float b = exp(-d * d * 300.0);
            col += vec3(0.2, 0.25, 0.3) * b; // dim grey debris
        }
    }
    return col;
}

void main()
{
    float len = (hullP > 0.01 ? 15.0 + 5.0 * hullP : 20.0);
    float glw = (glowP > 0.01 ? glowP : 1.0);
    float dbr = (debrisP > 0.01 ? debrisP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.03 + audioAdvance * 0.05;
    float drift = time * 2.0 + audioAdvance * 5.0;

    // Camera moves slowly around the derelict
    float orb = t * 0.4;
    float standoff = 0.8 * len;
    vec3 ro = vec3(cos(orb) * standoff,
                   2.0 * sin(t * 0.3),
                   sin(orb) * standoff);
    vec3 ta = vec3(0.0, 0.0, 0.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    // Unsteady camera roll
    float roll = 0.1 * sin(t * 0.5) + 0.05 * sin(t * 1.7);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    vec3 tint = max(imgPalette(0.3 + 0.1 * audioCentroid), vec3(0.16, 0.18, 0.22));

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    int steps = 0;
    
    for (int i = 0; i < 96; ++i) {
        p = ro + rd * d;
        float ds = map(p, len);
        m = hitMat;
        steps = i;
        if (ds < 0.005 * (1.0 + d * 0.1)) break;
        d += ds * 0.75;
        if (d > 100.0) { m = 0.0; break; }
    }

    vec3 col = background(rd, drift, dbr, tint);

    // Dim, distant starlight
    vec3 sunDir = normalize(vec3(-0.5, 0.3, 0.8));

    if (m > 0.5) {
        vec3 n = calcNormal(p, len);
        float dif = max(dot(n, sunDir), 0.0);
        float fill = 0.5 + 0.5 * dot(n, vec3(0.0, -1.0, 0.0));
        
        vec3 albedo = vec3(0.12, 0.14, 0.15); // dark, rusted metal
        
        // Add rust and scorch marks
        float scorch = fbm3(p * 2.0);
        albedo *= mix(vec3(0.8, 0.5, 0.3), vec3(1.0), smoothstep(0.4, 0.7, scorch));
        
        col = albedo * (0.16 + 1.1 * dif); // still dim, but now legible
        col += tint * albedo * fill * 0.30;
        
        // Flickering emergency lights
        // Pattern of lights along the hull
        vec2 grid = floor(p.xz * 2.0);
        float lightSlot = step(0.9, hash21(grid));
        float isWall = step(0.5, 1.0 - abs(n.y)); // mostly on sides
        
        // Erratic flickering tied to kick and hash
        float flicker = step(0.5, hash11(t * 50.0 + grid.x));
        flicker *= (0.2 + 0.8 * audioKick);
        flicker *= step(0.7, hash21(grid + floor(t * 2.0))); // sometimes totally dead
        
        vec3 lightCol = max(imgPalette(0.8), vec3(0.45, 0.36, 0.20));
        col += lightCol * lightSlot * isWall * flicker * 2.0 * glw;
        
        // AO
        col *= clamp(1.0 - float(steps) * 0.015, 0.1, 1.0);
    }
    
    // Eerie fog near the ship
    float fog = exp(-d * 0.02) * (0.2 + audioSwell * 0.2);
    col += tint * fog * 0.3;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
