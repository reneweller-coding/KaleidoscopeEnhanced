#version 330 core
out vec4 fragColor;
/**
 * @file ExoplanetRings.frag
 * @brief EXOPLANET RINGS: The camera skims closely over the immense, 
 * icy ring system of an exoplanet. Massive chunks of ice and rock tumble 
 * past, catching the light of a distant star.
 *   audioAdvance -> flight speed over the rings
 *   audioKick    -> flashes from micro-collisions in the rings
 *   audioSwell   -> ambient brightness of the star and ring dust
 *   audioChromaHue-> palette offset for the ice and rock colors
 *
 * Per-activation variety:
 *   densP float density of the ring debris (0.5..1.5)
 *   sizeP float size of the individual ice chunks (0.5..2.0)
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

uniform float densP;
uniform float sizeP;
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

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float hitMat = 0.0;

// Repetition domain with random offset and rotation
float map(vec3 p, float dp, float sp)
{
    float d = 1e10;
    
    // Confine to a thin ring plane
    float planeBound = abs(p.y) - 2.0;
    if (planeBound > 5.0) return planeBound; 
    
    // Grid of chunks
    vec3 id = floor(p / 4.0);
    vec3 q = mod(p, 4.0) - 2.0;
    
    // Only place rocks if near the plane and hash allows
    float h = hash31(id);
    if (abs(id.y) < 1.0 && h > 0.4 / dp) {
        // Random tumble
        float speed = (h - 0.5) * 5.0;
        q.xy = rot(time * speed) * q.xy;
        q.xz = rot(time * speed * 0.7) * q.xz;
        
        // Random rock shape
        float rockSize = (0.5 + h * 1.5) * sp;
        float rock = length(q) - rockSize;
        
        // Displacement for rough ice chunks
        rock += fbm(p * 2.0) * 0.5 * rockSize;
        
        if (rock < d) d = rock;
    } else {
        d = min(d, length(q) + 0.5); // skip distance
    }
    
    // Smooth blending with the plane bounding to help raymarcher
    d = max(d, abs(p.y) - 2.0);
    
    hitMat = 1.0;
    return d;
}

vec3 calcNormal(vec3 p, float dp, float sp)
{
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(
        map(p + e.xyy, dp, sp) - map(p - e.xyy, dp, sp),
        map(p + e.yxy, dp, sp) - map(p - e.yxy, dp, sp),
        map(p + e.yyx, dp, sp) - map(p - e.yyx, dp, sp)));
}

void main()
{
    float dp = (densP > 0.01 ? densP : 1.0);
    float sp = (sizeP > 0.01 ? sizeP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 4.0 + audioAdvance * 15.0;
    
    // Camera is skimming above the ring plane
    vec3 ro = vec3(0.0, 3.5 + sin(time * 0.5) * 1.5, drift);
    vec3 ta = ro + vec3(0.0, -0.2, 1.0); // looking slightly down
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.05 * sin(time * 0.3);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    int steps = 0;
    
    for (int i = 0; i < 90; ++i) {
        p = ro + rd * d;
        float ds = map(p, dp, sp);
        m = hitMat;
        steps = i;
        if (ds < 0.01 * (1.0 + d * 0.05)) break;
        d += ds * 0.8;
        if (d > 120.0) { m = 0.0; break; }
    }

    vec3 col = vec3(0.005, 0.008, 0.015); // dark space
    
    vec3 sunDir = normalize(vec3(1.0, 0.5, 0.5));
    vec3 iceColor = imgPalette(0.4);
    vec3 flashColor = imgPalette(0.8 + audioKick * 0.1);

    if (m > 0.5 && d <= 120.0) {
        vec3 n = calcNormal(p, dp, sp);
        float dif = max(dot(n, sunDir), 0.0);
        float fill = 0.5 + 0.5 * dot(n, vec3(0.0, -1.0, 0.0));
        
        vec3 albedo = mix(vec3(0.8, 0.9, 1.0), iceColor, 0.5); // Icy blue/white
        
        // Specular highlight for ice
        float spec = pow(max(dot(reflect(-sunDir, n), -rd), 0.0), 16.0);
        
        col = albedo * (0.1 + dif * (1.0 + audioSwell)) + spec * vec3(1.0) * (0.5 + audioSwell);
        col += albedo * fill * 0.1;
        
        // Micro-collisions flash
        float id = hash31(floor(p / 4.0));
        if (id > 0.9) {
            float flash = step(0.95, fract(time * 5.0 + id * 10.0));
            col += flashColor * flash * (2.0 + audioKick * 5.0);
        }
        
        col *= clamp(1.0 - float(steps) * 0.01, 0.2, 1.0);
    }
    
    // Add thick ring dust (volumetric fog along the plane)
    float planeDist = abs(ro.y) / abs(rd.y);
    if (rd.y < 0.0 || ro.y < 2.0) {
        float maxDist = min(d, 120.0);
        
        // Accumulate dust
        float dust = 0.0;
        vec3 rp = ro;
        float stepSize = maxDist / 15.0;
        for (int i = 0; i < 15; ++i) {
            if (abs(rp.y) < 2.5) {
                dust += (1.0 - smoothstep(0.0, 2.5, abs(rp.y))) * stepSize * 0.05 * dp;
            }
            rp += rd * stepSize;
        }
        dust = clamp(dust, 0.0, 1.0);
        
        vec3 dustCol = mix(vec3(0.1, 0.15, 0.2), iceColor, 0.5);
        // Sun scattering in dust
        float scat = max(dot(rd, sunDir), 0.0);
        dustCol += vec3(0.8, 0.7, 0.6) * pow(scat, 4.0) * (0.5 + audioSwell);
        
        col = mix(col, dustCol, dust);
    }
    
    // Deep space fade
    col = mix(vec3(0.0), col, exp(-d * 0.01));

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
