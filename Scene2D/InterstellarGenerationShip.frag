#version 330 core
out vec4 fragColor;
/**
 * @file InterstellarGenerationShip.frag
 * @brief INTERSTELLAR GENERATION SHIP: A colossal rotating cylinder traveling
 * through interstellar space. The camera glides along its miles-long hull, 
 * revealing lit habitation domes, solar arrays, and a glowing propulsion drive.
 *   audioAdvance -> flight speed of the ship and camera progression
 *   audioKick    -> flashes from external comms and engine pulses
 *   audioSwell   -> ambient illumination and starfield brightness
 *   audioPhase   -> rotation of the cylinder
 *   audioChromaHue-> palette offset for the biosphere lights
 *
 * Per-activation variety:
 *   hullP float complexity of the hull (0.7..1.5)
 *   glowP float intensity of the biosphere windows (0.6..1.8)
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

float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float sdCylinder(vec3 p, vec3 c)
{
  return length(p.xy - c.xy) - c.z;
}

float hitMat = 0.0;

float map(vec3 p, float hp)
{
    float d = 1e10;
    float mat = 0.0;
    
    // Main cylinder body
    float rad = 15.0;
    float cyl = sdCylinder(p, vec3(0.0, 0.0, rad));
    
    // Habitation rings
    float ringZ = mod(p.z, 20.0) - 10.0;
    float ring = sdCylinder(vec3(p.xy, ringZ), vec3(0.0, 0.0, rad + 1.5));
    // Cut ring into sections
    ring = max(ring, abs(ringZ) - 2.0);
    
    // Combine hull
    float ship = min(cyl, ring);
    
    // Detail the hull
    float th = atan(p.y, p.x);
    float pz = p.z;
    
    // Grid panels
    float thStep = 12.0 * hp; // Number of panels around
    float pzStep = 1.0 * hp;  // Number of panels along
    
    float thId = floor(th * thStep / 6.2831853);
    float pzId = floor(pz * pzStep);
    
    float depth = hash21(vec2(thId, pzId)) * 0.5;
    ship += depth; // Extrude outward slightly based on noise
    
    if (ship < d) {
        d = ship;
        mat = 1.0;
        
        // Window check
        float wNoise = hash21(vec2(thId, pzId + 5.3));
        if (wNoise > 0.8) mat = 2.0; // Biosphere/city lights
    }
    
    hitMat = mat;
    return d;
}

vec3 calcNormal(vec3 p, float hp)
{
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(
        map(p + e.xyy, hp) - map(p - e.xyy, hp),
        map(p + e.yxy, hp) - map(p - e.yxy, hp),
        map(p + e.yyx, hp) - map(p - e.yyx, hp)));
}

vec3 background(vec3 rd, float drift, vec3 tint)
{
    vec3 col = vec3(0.005, 0.005, 0.008);
    // Simple starfield
    for (int i = 0; i < 3; ++i) {
        float sc = 50.0 + 50.0 * float(i);
        vec3 sp = rd * sc + vec3(0.0, 0.0, drift * 0.02);
        vec3 cell = floor(sp);
        vec3 f = fract(sp) - 0.5;
        if (hash31(cell) > 0.98 - 0.005 * float(i)) {
            float d = length(f);
            float b = exp(-d * d * 300.0);
            col += vec3(0.8, 0.9, 1.0) * b;
        }
    }
    return col;
}

void main()
{
    float hp = (hullP > 0.01 ? hullP : 1.0);
    float glw = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 5.0 + audioAdvance * 15.0;
    
    // Camera travels alongside the cylinder
    vec3 ro = vec3(22.0, 5.0 * sin(time * 0.2), drift);
    vec3 ta = ro + vec3(-0.3, -0.1, 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.05 * sin(time * 0.3);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);
    
    // Rotate the ship around Z (by rotating the ray inversely)
    float spin = time * 0.2 + audioPhase * 0.5;
    mat2 rotZ = mat2(cos(spin), -sin(spin), sin(spin), cos(spin));
    vec3 localRo = ro;
    localRo.xy = rotZ * localRo.xy;
    vec3 localRd = rd;
    localRd.xy = rotZ * localRd.xy;

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    int steps = 0;
    
    for (int i = 0; i < 80; ++i) {
        p = localRo + localRd * d;
        float ds = map(p, hp);
        m = hitMat;
        steps = i;
        if (ds < 0.01 * (1.0 + d * 0.05)) break;
        d += ds * 0.8;
        if (d > 120.0) { m = 0.0; break; }
    }

    vec3 tint = imgPalette(0.5);
    vec3 col = background(rd, drift, tint);

    vec3 sunDir = normalize(vec3(0.8, 0.5, 0.5));
    // Transform sun direction to local space too!
    vec3 localSun = sunDir;
    localSun.xy = rotZ * localSun.xy;

    if (m > 0.5) {
        vec3 n = calcNormal(p, hp);
        float dif = max(dot(n, localSun), 0.0);
        float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
        
        vec3 albedo = vec3(0.3, 0.32, 0.35); // white/grey hull
        
        col = albedo * (0.1 + dif * (1.0 + audioSwell * 0.2));
        col += albedo * fill * 0.1;
        
        if (m == 2.0) {
            // Biosphere / City lights inside the ring
            vec3 lightCol = imgPalette(0.7 + 0.1 * audioKick);
            col += lightCol * (1.5 + audioLevel) * glw;
        }
        
        // Anti-collision strobes
        float pzId = floor(p.z * hp);
        if (mod(pzId, 10.0) == 0.0) {
            float blink = step(0.95, fract(time * 2.0 + pzId * 0.1));
            vec3 strobeCol = vec3(1.0, 0.2, 0.1);
            col += strobeCol * blink * (2.0 + audioKick * 3.0) * glw * step(0.8, n.x);
        }
        
        // AO
        col *= clamp(1.0 - float(steps) * 0.015, 0.2, 1.0);
    }
    
    // Add engine glow if looking backward
    float lookBack = max(dot(rd, vec3(0.0, 0.0, -1.0)), 0.0);
    if (lookBack > 0.9) {
        float plume = pow(lookBack, 20.0);
        col += imgPalette(0.9) * plume * (1.0 + audioSwell * 2.0) * glw;
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
