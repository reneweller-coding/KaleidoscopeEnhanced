#version 330 core
out vec4 fragColor;
/**
 * @file CyborgHiveShip.frag
 * @brief CYBORG HIVE SHIP: A terrifying, claustrophobic flight through the interior
 * of a massive, geometrically perfect cyborg hive ship. Cold steel, dense greebles,
 * and scanning lasers that react to the beat.
 *   audioAdvance -> camera flight speed through the hive
 *   audioKick    -> flashes from machinery and lasers
 *   audioSwell   -> ambient interior glow and active nodes
 *   audioChromaHue-> palette offset for the hive's energy
 *
 * Per-activation variety:
 *   techP float complexity of the greebles and structures (0.5..1.5)
 *   glowP float intensity of the hive nodes (0.5..2.0)
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

uniform float techP;
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
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float hitMat = 0.0;
float hitGlow = 0.0;

float map(vec3 p, float tp) {
    float d = 1e10;
    float mat = 0.0;
    float glow = 0.0;

    // Main tunnel is a square shaft
    vec3 q = p;
    q.xy = abs(q.xy);
    float shaft = 4.0 - max(q.x, q.y);
    if (shaft < d) { d = shaft; mat = 1.0; }

    // Grid repetition for greebles
    vec3 cell = floor(p * 2.0);
    vec3 lq = fract(p * 2.0) - 0.5;

    // Check if cell is on the walls
    if (max(abs(cell.x), abs(cell.y)) >= 7.0) {
        float h = hash31(cell);
        if (h < 0.8 * tp) {
            float b = sdBox(lq, vec3(0.4 * hash31(cell + 1.0), 0.4 * hash31(cell + 2.0), 0.4 + 0.2 * hash31(cell + 3.0)));
            if (b / 2.0 < d) {
                d = b / 2.0;
                mat = 2.0; // Machinery

                if (h < 0.1) {
                    glow = 1.0; // Hive node
                }
            }
        }
    }

    // Giant structural pillars crossing the shaft
    vec3 pq = p;
    pq.z = mod(pq.z, 20.0) - 10.0;
    float pId = floor(p.z / 20.0);

    if (hash11(pId) > 0.5) {
        // Vertical pillar
        float pillar = sdBox(pq, vec3(1.0, 5.0, 1.0));
        if (pillar < d) { d = pillar; mat = 3.0; glow = step(0.9, hash21(pq.yz)); }
    } else {
        // Horizontal pillar
        float pillar = sdBox(pq, vec3(5.0, 1.0, 1.0));
        if (pillar < d) { d = pillar; mat = 3.0; glow = step(0.9, hash21(pq.xz)); }
    }

    hitMat = mat;
    hitGlow = glow;

    return d;
}

vec3 calcNormal(vec3 p, float tp) {
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(
        map(p + e.xyy, tp) - map(p - e.xyy, tp),
        map(p + e.yxy, tp) - map(p - e.yxy, tp),
        map(p + e.yyx, tp) - map(p - e.yyx, tp)
    ));
}

void main()
{
    float tp = (techP > 0.01 ? techP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 4.0 + audioAdvance * 15.0;

    // Camera rotating inside the shaft 90 degrees occasionally
    float phase = floor(time * 0.20);
    float camRoll = smoothstep(0.0, 1.0, fract(time * 0.2)) * 1.570796 + phase * 1.570796;

    vec3 ro = vec3(0.0, 0.0, drift);

    // Slight jitter based on kick
    ro.x += (hash11(time * 10.0) - 0.5) * audioKick * 0.2;
    ro.y += (hash11(time * 10.0 + 1.0) - 0.5) * audioKick * 0.2;

    vec3 ta = ro + vec3(0.0, 0.0, 1.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = camRoll + audioPhase * 0.1;
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    float g = 0.0;
    int steps = 0;

    for (int i = 0; i < 90; ++i) {
        p = ro + rd * d;
        float ds = map(p, tp);
        m = hitMat;
        g = hitGlow;
        steps = i;
        if (ds < 0.01 * (1.0 + d * 0.05)) break;
        d += ds * 0.75;
        if (d > 80.0) { m = 0.0; break; }
    }

    vec3 col = vec3(0.0);

    vec3 hiveColor = imgPalette(0.3); // usually sickly green/yellow
    vec3 laserColor = imgPalette(0.8 + audioKick * 0.2); // Red lasers

    if (m > 0.5) {
        vec3 n = calcNormal(p, tp);

        // Spot light from camera
        float dif = max(dot(n, normalize(ro - p)), 0.0);

        vec3 albedo = vec3(0.1, 0.12, 0.15); // dark metal
        if (m == 3.0) albedo = vec3(0.05); // darker pillars

        col = albedo * (0.34 + dif * 1.45);

        // Specular
        float spec = pow(max(dot(reflect(-normalize(ro - p), n), -rd), 0.0), 32.0);
        col += vec3(0.5) * spec;

        if (g == 1.0) {
            float blink = step(0.5, sin(p.z * 5.0 - time * 10.0) + audioSwell);
            col += hiveColor * blink * gp * (1.0 + audioKick * 2.0);
        }

        // Scanning lasers traversing the walls
        float scanZ = fract(p.z * 0.1 - time * 0.5) * 10.0;
        if (abs(scanZ - 5.0) < 0.1) {
            col += laserColor * 5.0 * gp * (1.0 + audioKick);
        }

        col *= clamp(1.0 - float(steps) * 0.015, 0.1, 1.0);
    }

    // Atmospheric darkness -- weight grows with distance (exp(-d*k) alone
    // is 1.0 at the camera and would darken the NEAREST geometry most).
    col = mix(col, vec3(0.01, 0.02, 0.01), 1.0 - exp(-d * 0.04));

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
