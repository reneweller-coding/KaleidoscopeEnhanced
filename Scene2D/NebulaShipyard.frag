#version 330 core
out vec4 fragColor;
/**
 * @file NebulaShipyard.frag
 * @brief NEBULA SHIPYARD: A massive orbital drydock surrounded by scaffolding
 * and robotic arms, constructing new ships amidst a colorful nebula. Welding
 * flares and engine tests flash to the beat.
 *   audioAdvance -> camera flythrough speed
 *   audioKick    -> welding flares and construction sparks
 *   audioSwell   -> nebula brightness and floodlights
 *   audioChromaHue-> nebula and light palette
 *
 * Per-activation variety:
 *   yardP float shipyard size/complexity (0.7..1.5)
 *   sparkP float intensity of welding sparks (0.6..1.8)
 *   nebP float nebula density (0.5..1.5)
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

uniform float yardP;
uniform float sparkP;
uniform float nebP;
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
vec3 sparkPos = vec3(0.0);

float map(vec3 p, float yp)
{
    float d = 1e10;
    float mat = 0.0;
    
    // Grid of shipyard scaffolding
    vec3 cp = p;
    vec3 id = floor(cp / 8.0);
    cp = mod(cp, 8.0) - 4.0;
    
    // Core ships being built (only in central slots)
    if (abs(id.x) < 1.0 * yp && abs(id.y) < 1.0 * yp) {
        float ship = sdBox(cp, vec3(2.5, 1.5, 3.5));
        if (ship < d) { d = ship; mat = 1.0; } // Ship hull
        
        // Scaffolding cage around it
        float cage = sdBox(abs(cp) - vec3(2.7, 1.7, 3.7), vec3(0.1, 0.1, 3.8));
        cage = min(cage, sdBox(abs(cp) - vec3(2.7, 1.7, 3.7), vec3(2.8, 0.1, 0.1)));
        cage = min(cage, sdBox(abs(cp) - vec3(2.7, 1.7, 3.7), vec3(0.1, 1.8, 0.1)));
        
        if (cage < d) { d = cage; mat = 2.0; } // Scaffolding
        
        // Welding sparks node
        if (length(cp - vec3(2.6, 1.6, 0.0)) < 0.5) {
            sparkPos = p; // Record position for sparks
        }
    } else {
        // Just scaffolding and empty space
        float cage = sdBox(abs(cp) - vec3(3.8, 3.8, 3.8), vec3(0.1, 0.1, 4.0));
        cage = min(cage, sdBox(abs(cp) - vec3(3.8, 3.8, 3.8), vec3(4.0, 0.1, 0.1)));
        cage = min(cage, sdBox(abs(cp) - vec3(3.8, 3.8, 3.8), vec3(0.1, 4.0, 0.1)));
        
        if (cage < d) { d = cage; mat = 2.0; }
    }
    
    hitMat = mat;
    return d;
}

vec3 calcNormal(vec3 p, float yp)
{
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(
        map(p + e.xyy, yp) - map(p - e.xyy, yp),
        map(p + e.yxy, yp) - map(p - e.yxy, yp),
        map(p + e.yyx, yp) - map(p - e.yyx, yp)));
}

void main()
{
    float yp = (yardP > 0.01 ? yardP : 1.0);
    float sp = (sparkP > 0.01 ? sparkP : 1.0);
    float np = (nebP > 0.01 ? nebP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.1 + audioAdvance * 0.2;
    float drift = time * 4.0 + audioAdvance * 10.0;
    
    vec3 ro = vec3(5.0 * sin(t * 0.5), 5.0 * cos(t * 0.4), drift);
    vec3 ta = ro + vec3(sin(t * 0.3), cos(t * 0.2), 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.1 * sin(t);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    int steps = 0;
    
    for (int i = 0; i < 80; ++i) {
        p = ro + rd * d;
        float ds = map(p, yp);
        // Clearance-Blase: die Bahn schneidet Werft-Traeger; ohne sie flog
        // die Kamera IN die Struktur und der Schirm wurde vollflaechig.
        ds = max(ds, 4.0 - d);
        m = hitMat;
        steps = i;
        if (ds < 0.01 * (1.0 + d * 0.05)) break;
        d += ds * 0.8;
        if (d > 100.0) { m = 0.0; break; }
    }

    // Nebula background
    // Nebel mit Floor und Grundhelligkeit -- vorher pow(n,2)*Palette auf
    // dunklem Foto = schwarzer Hintergrund, nur Traeger im Nichts.
    vec3 nebTint = max(imgPalette(0.3 + 0.1 * audioCentroid), vec3(0.14, 0.10, 0.18));
    float nebNoise = fbm(rd * 2.0 + vec3(0.0, 0.0, drift * 0.01));
    vec3 col = nebTint * (0.22 + pow(nebNoise, 1.5) * np * (0.8 + audioSwell * 0.5));

    vec3 sunDir = normalize(vec3(0.5, 0.8, -0.2));
    
    vec3 weldColor = imgPalette(0.8 + 0.2 * audioKick);

    if (m > 0.5) {
        vec3 n = calcNormal(p, yp);
        float dif = max(dot(n, sunDir), 0.0);
        float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
        
        vec3 albedo = vec3(0.1);
        if (m == 1.0) albedo = vec3(0.4, 0.42, 0.45); // ship hull
        else albedo = vec3(0.8, 0.6, 0.1); // yellow/orange scaffolding
        
        col = albedo * (0.16 + dif);
        col += nebTint * albedo * fill * 0.35;
        // Rim-Licht: grosse Rumpfflaechen bekommen Kontur statt grauer Wand.
        col += albedo * pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.5;
        
        // Add welding flares
        float weldDist = length(p - sparkPos);
        float weldPulse = step(0.9, hash21(floor(p.xz * 2.0) + floor(t * 10.0)));
        if (weldDist < 2.0) {
            col += weldColor * exp(-weldDist * 4.0) * weldPulse * (2.0 + audioKick * 5.0) * sp;
        }
        
        col *= clamp(1.0 - float(steps) * 0.015, 0.2, 1.0);
    }
    
    // Add volumetric flares / sparks in empty space
    if (d > 5.0) {
        float sparkDist = length(ro + rd * min(d, 20.0) - sparkPos);
        if (sparkDist < 8.0) {
            float flare = exp(-sparkDist * 0.5) * (audioKick * 1.5);
            col += weldColor * flare * sp;
        }
    }
    
    // Nebula fog
    float fog = exp(-d * 0.01 * np);
    col = mix(nebTint * 0.2, col, fog);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
