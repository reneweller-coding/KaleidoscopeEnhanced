#version 330 core
out vec4 fragColor;
/**
 * @file BinaryStarSystem.frag
 * @brief BINARY STAR SYSTEM: Two massive stars orbit each other in a close binary
 * system, tearing stellar material from one another. Solar flares and the shared
 * plasma stream react violently to the beat.
 *   audioAdvance -> camera orbit speed
 *   audioKick    -> intense solar flares and plasma bursts
 *   audioSwell   -> brightness of the stellar coronas
 *   audioChromaHue-> palette offset for the star types
 *
 * Per-activation variety:
 *   distP float distance between the two stars (0.5..1.5)
 *   flareP float intensity of the solar flares (0.5..2.0)
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

uniform float distP;
uniform float flareP;
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
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// Function for a star surface (displaced sphere)
float sdStar(vec3 p, float r, float t) {
    float d = length(p) - r;
    // intense surface turbulence
    d += fbm(p * 5.0 - vec3(t)) * 0.1 * r;
    d += fbm(p * 2.0 + vec3(0.0, t * 2.0, 0.0)) * 0.05 * r;
    return d;
}

void main()
{
    float sep = (distP > 0.01 ? distP : 1.0);
    float fp = (flareP > 0.01 ? flareP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.2 + audioAdvance * 0.5;
    
    // Camera orbit
    vec3 ro = vec3(5.0 * cos(t * 0.5), 1.0 * sin(t * 0.3), 5.0 * sin(t * 0.5));
    vec3 ta = vec3(0.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    // Camera roll
    float roll = 0.1 * sin(t * 0.2);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 col = vec3(0.0);
    
    // Binary positions (orbiting each other)
    float orbitSpeed = time * 0.5 + audioPhase;
    vec3 p1 = vec3(cos(orbitSpeed) * sep, 0.0, sin(orbitSpeed) * sep);
    vec3 p2 = vec3(-cos(orbitSpeed) * sep, 0.0, -sin(orbitSpeed) * sep);
    
    vec3 c1 = imgPalette(0.1 + audioCentroid * 0.2); // Blue/white giant
    vec3 c2 = imgPalette(0.8 + audioKick * 0.1);     // Red/orange dwarf
    
    // Volumetric raymarching for the stars and plasma
    for(int i = 0; i < 70; i++) {
        vec3 p = ro + rd * d;
        
        // Star 1
        float d1 = sdStar(p - p1, 0.8, time * 0.5);
        // Star 2
        float d2 = sdStar(p - p2, 0.6, time * 0.8);
        
        // Plasma bridge connecting them
        float lineDist = length(cross(p - p1, p2 - p1)) / length(p2 - p1);
        float alongLine = dot(p - p1, p2 - p1) / length(p2 - p1);
        float plasma = 1e10;
        
        if (alongLine > 0.0 && alongLine < length(p2 - p1)) {
            plasma = lineDist - 0.2;
            plasma += fbm(p * 3.0 - vec3(time * 2.0)) * 0.3; // turbulent flow
        }
        
        float ds = min(min(d1, d2), plasma);
        
        // Soft rendering of the surfaces and plasma
        if (ds < 0.1) {
            float alpha = (0.1 - ds) * 10.0;
            
            // Influence blending
            float w1 = 1.0 / (length(p - p1) + 0.1);
            float w2 = 1.0 / (length(p - p2) + 0.1);
            vec3 localCol = mix(c1, c2, w2 / (w1 + w2));
            
            // Solar flares triggering on kick
            float flare = step(0.9, hash11(floor(p.x * 5.0) + floor(time * 8.0)));   // was 10 Hz
            localCol *= 1.0 + flare * audioKick * 3.0 * fp;
            
            // Core brightness
            localCol *= 1.5 + audioSwell * 2.0;
            
            col += localCol * alpha * 0.1;
        }
        
        // Coronal glow (volumetric)
        float glow1 = exp(-length(p - p1) * 1.5);
        float glow2 = exp(-length(p - p2) * 2.0);
        col += c1 * glow1 * (0.02 + audioSwell * 0.05);
        col += c2 * glow2 * (0.02 + audioSwell * 0.05);
        
        d += max(0.05, ds * 0.8);
        if(d > 10.0) break;
    }
    
    // Background starfield
    vec3 bgCol = vec3(0.0);
    for (int i = 0; i < 2; ++i) {
        float sc = 50.0 + 50.0 * float(i);
        vec3 st = rd * sc;
        vec3 cell = floor(st);
        vec3 f = fract(st) - 0.5;
        if (hash11(dot(cell, vec3(12.3, 45.6, 78.9))) > 0.98) {
            bgCol += mix(c1, c2, hash11(cell.x)) * exp(-length(f) * length(f) * 400.0);
        }
    }
    col += bgCol * (0.2 + audioSwell * 0.3);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
