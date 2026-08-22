#version 330 core
out vec4 fragColor;
/**
 * @file SpaceStationPromenade.frag
 * @brief SPACE STATION PROMENADE: The camera wanders through the grand, high-tech
 * promenade of a massive rotating space station. Huge windows offer glimpses of the
 * starfield outside. Neon lights and holograms pulse to the beat.
 *   audioAdvance -> walking/flight speed along the promenade
 *   audioKick    -> flashes from advertising holograms and accent lights
 *   audioSwell   -> ambient daylight/interior lighting
 *   audioChromaHue-> palette offset for the interior lights
 *
 * Per-activation variety:
 *   archP float complexity of the station architecture (0.5..1.5)
 *   glowP float intensity of the neon lights (0.5..2.0)
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

uniform float archP;
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

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Distance to a cylinder oriented along Z
float sdCylinder(vec3 p, float r) {
    return length(p.xy) - r;
}

float hitMat = 0.0;
float hitGlow = 0.0;

float map(vec3 p, float ap) {
    float d = 1e10;
    float mat = 0.0;
    float glow = 0.0;
    
    // The main promenade tube (rotating cylinder)
    float r = 5.0;
    float tube = r - length(p.xy);
    
    // We want the interior. 
    if (tube < d) { d = tube; mat = 1.0; }
    
    // Repetition along Z for ribs and windows
    float pz = mod(p.z, 4.0) - 2.0;
    float zId = floor(p.z / 4.0);
    
    // Circular ribs
    float rib = length(p.xy) - (r - 0.2);
    rib = max(rib, abs(pz) - 0.5);
    
    if (rib < d) { d = rib; mat = 2.0; }
    
    // Angular repetition for interior structures
    float a = atan(p.y, p.x);
    float sector = floor(a / (3.14159 / 4.0));
    float sa = a - sector * (3.14159 / 4.0) - (3.14159 / 8.0);
    
    vec2 polarP = length(p.xy) * vec2(cos(sa), sin(sa));
    vec3 localP = vec3(polarP.x, polarP.y, pz);
    
    // Pillars/structures on the walls
    float pillar = sdBox(localP - vec3(r, 0.0, 0.0), vec3(0.5, 0.5, 1.0));
    
    // Cut out windows from the main tube (when not on a rib and in certain sectors)
    float windowCut = sdBox(localP - vec3(r, 0.0, 0.0), vec3(0.5, 1.5, 1.0));
    if (mod(sector, 2.0) == 0.0) {
        // Cut window
        tube = max(tube, -windowCut);
        d = min(tube, rib);
        if (d == tube) mat = 1.0;
    }
    
    if (pillar < d) { d = pillar; mat = 3.0; glow = 1.0; }
    
    // Floating neon signs/holograms in the center
    float signBox = sdBox(vec3(p.x, p.y + 2.0, pz), vec3(0.1, 1.0, 0.8));
    if (hash11(zId) > 0.5 && signBox < d) {
        d = signBox; mat = 4.0; glow = 2.0;
    }
    
    hitMat = mat;
    hitGlow = glow;
    
    // To allow looking outside, the d must not clip too tightly on the tube if there's a window
    // But raymarching will just go through the negative space.
    
    return d;
}

vec3 calcNormal(vec3 p, float ap) {
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(
        map(p + e.xyy, ap) - map(p - e.xyy, ap),
        map(p + e.yxy, ap) - map(p - e.yxy, ap),
        map(p + e.yyx, ap) - map(p - e.yyx, ap)
    ));
}

void main()
{
    float ap = (archP > 0.01 ? archP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 2.0 + audioAdvance * 5.0;
    
    // Camera rotating inside the station
    float camRoll = time * 0.1;
    vec3 ro = vec3(2.0 * cos(camRoll), 2.0 * sin(camRoll), drift);
    vec3 ta = ro + vec3(-0.5 * cos(camRoll), -0.5 * sin(camRoll), 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.2 * sin(time * 0.3) + audioPhase * 0.1;
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    float g = 0.0;
    int steps = 0;
    
    for (int i = 0; i < 80; ++i) {
        p = ro + rd * d;
        float ds = map(p, ap);
        m = hitMat;
        g = hitGlow;
        steps = i;
        if (ds < 0.01 * (1.0 + d * 0.05)) break;
        d += ds * 0.8;
        if (d > 80.0) { m = 0.0; break; } // look out window
    }

    vec3 col = vec3(0.0);
    
    vec3 signColor1 = imgPalette(0.3);
    vec3 signColor2 = imgPalette(0.8 + audioKick * 0.1);

    if (m > 0.5 && d < 80.0) {
        vec3 n = calcNormal(p, ap);
        
        // Interior light (from center)
        vec3 lightDir = normalize(vec3(0.0, 0.0, p.z) - p);
        float dif = max(dot(n, lightDir), 0.0);
        
        vec3 albedo = vec3(0.2);
        if (m == 1.0) albedo = vec3(0.6, 0.65, 0.7); // white panels
        if (m == 2.0) albedo = vec3(0.3, 0.3, 0.35); // dark ribs
        
        col = albedo * (0.5 + dif * (1.5 + audioSwell));
        
        // Glows
        if (g == 1.0) {
            float strip = step(0.8, fract(p.z * 2.0));
            col += signColor1 * strip * gp * (1.0 + audioKick * 2.0);
        }
        else if (m == 4.0 && g == 2.0) { // Hologram signs
            float flicker = step(0.1, hash11(floor(time * 8.0 + p.z)));   // was 20 Hz -- over the noise-strobe budget
            float scanline = sin(p.y * 100.0 - time * 10.0) * 0.5 + 0.5;
            vec3 sc = mix(signColor1, signColor2, hash11(floor(p.z)));
            col = sc * flicker * scanline * gp * (2.0 + audioKick * 3.0);
        }
        
        col *= clamp(1.0 - float(steps) * 0.01, 0.1, 1.0);
    } else {
        // Outside window (starfield)
        vec3 bgCol = vec3(0.0);
        for (int i = 0; i < 2; ++i) {
            float sc = 50.0 + 50.0 * float(i);
            vec3 st = rd * sc;
            vec3 cell = floor(st);
            vec3 f = fract(st) - 0.5;
            if (hash11(dot(cell, vec3(12.3, 45.6, 78.9))) > 0.98) {
                bgCol += mix(signColor1, vec3(1.0), hash11(cell.x)) * exp(-length(f) * length(f) * 400.0);
            }
        }
        col = bgCol * (0.8 + audioSwell * 0.6);
    }
    
    // Atmospheric haze inside
    if (d < 80.0) {
        col = mix(col, vec3(0.03, 0.04, 0.06), exp(-d * 0.05));
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
