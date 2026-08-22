#version 330 core
out vec4 fragColor;
/**
 * @file VoidLeviathan.frag
 * @brief VOID LEVIATHAN: Encounter with a colossal, space-dwelling entity in 
 * the deep abyss. The creature's leathery skin is covered in bioluminescent 
 * patterns that pulse to the beat, while massive tentacles drift past.
 *   audioAdvance -> flight speed alongside the leviathan
 *   audioKick    -> bright bioluminescent flashes on the creature's skin
 *   audioSwell   -> ambient visibility (starlight revealing the sheer scale)
 *   audioChromaHue-> palette offset for the bioluminescence
 *
 * Per-activation variety:
 *   scaleP float apparent scale/distance to the creature (0.5..1.5)
 *   glowP float intensity of the bioluminescent patterns (0.5..2.0)
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

uniform float scaleP;
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
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

// Map the leviathan's body and tentacles
float map(vec3 p, float sp) {
    float d = 1e10;
    
    // Main body (massive, slowly undulating surface)
    float body = p.x + 10.0 * sp;
    body -= fbm(p * 0.1 - vec3(time * 0.5, 0.0, 0.0)) * 3.0 * sp;
    body -= fbm(p * 0.5) * 0.5 * sp; // leathery skin texture
    
    d = min(d, body);
    
    // Huge tentacles drifting past
    vec3 q = p;
    q.y = mod(q.y, 20.0) - 10.0;
    q.z += sin(p.y * 0.1 + time) * 5.0; // undulating movement
    q.x += cos(p.y * 0.1 + time * 0.8) * 3.0;
    
    float tentacle = length(q.xz) - 1.5 * sp;
    tentacle -= fbm(p * 1.0) * 0.3 * sp; // bumpy skin on tentacles
    
    d = min(d, tentacle);
    
    return d;
}

vec3 calcNormal(vec3 p, float sp) {
    vec2 e = vec2(0.1, 0.0);
    return normalize(vec3(
        map(p + e.xyy, sp) - map(p - e.xyy, sp),
        map(p + e.yxy, sp) - map(p - e.yxy, sp),
        map(p + e.yyx, sp) - map(p - e.yyx, sp)
    ));
}

void main()
{
    float sp = (scaleP > 0.01 ? scaleP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 2.0 + audioAdvance * 5.0;
    
    // Camera is drifting alongside the massive creature
    vec3 ro = vec3(0.0, drift, time * 2.0);
    vec3 ta = ro + vec3(-0.2, 1.0, 0.2); // Looking slightly towards the body
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.05 * sin(time * 0.2);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    int steps = 0;
    
    for (int i = 0; i < 80; ++i) {
        p = ro + rd * d;
        float ds = map(p, sp);
        steps = i;
        if (ds < 0.05 * (1.0 + d * 0.05)) break;
        d += ds * 0.8;
        if (d > 80.0) break;
    }

    vec3 col = vec3(0.0);
    
    vec3 biolumColor = imgPalette(0.7 + audioCentroid * 0.2); // bioluminescent glow
    vec3 skinColor = vec3(0.05, 0.08, 0.1); // dark, deep sea/void color

    if (d < 80.0) {
        vec3 n = calcNormal(p, sp);
        
        // Ambient starlight / very faint distant sun
        vec3 lightDir = normalize(vec3(1.0, 0.5, 0.5));
        float dif = max(dot(n, lightDir), 0.0);
        
        col = skinColor * (0.16 + dif * (0.55 + audioSwell * 0.4));
        
        // Bioluminescent patterns on the skin
        // Create intricate patterns using fbm and sine waves
        float pattern = fbm(p * 2.0 / sp);
        float stripe = sin(p.y * 2.0 + pattern * 10.0 - time * 5.0);
        stripe = smoothstep(0.8, 1.0, stripe); // sharp stripes
        
        // Reaction to kick
        float flash = step(0.9, hash11(floor(p.y * 0.5) + floor(time * 5.0)));
        
        col += biolumColor * stripe * gp * (1.0 + flash * audioKick * 5.0);
        
        // Specular reflection (wet/leathery)
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 16.0);
        col += vec3(0.2) * spec * (0.1 + audioSwell * 0.2);
        
        col *= clamp(1.0 - float(steps) * 0.01, 0.1, 1.0);
    } else {
        // Deep void background
        col = vec3(0.02, 0.03, 0.045) * (1.0 + audioSwell);
        
        // Sparse stars
        for (int i = 0; i < 2; ++i) {
            float sc = 50.0 + 50.0 * float(i);
            vec3 st = rd * sc;
            vec3 cell = floor(st);
            vec3 f = fract(st) - 0.5;
            if (hash11(dot(cell, vec3(12.3, 45.6, 78.9))) > 0.99) {
                col += vec3(0.5, 0.6, 0.8) * exp(-length(f) * length(f) * 400.0);
            }
        }
    }
    
    // Depth fog (the void is murky)
    col = mix(col, vec3(0.0), exp(-d * 0.03));

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
