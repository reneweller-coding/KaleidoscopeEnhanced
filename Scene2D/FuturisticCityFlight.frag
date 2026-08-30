#version 330 core
out vec4 fragColor;
/**
 * @file FuturisticCityFlight.frag
 * @brief FUTURISTIC CITY FLIGHT: High-speed flight through a dense cyberpunk-style
 * metropolis. Buildings rise from the fog, with glowing windows and neon signs
 * that react to the music. Flying cars dart through the canyons.
 *   audioAdvance -> forward flight speed and traffic movement
 *   audioKick    -> flashes from neon signs and headlights
 *   audioSwell   -> fog density and overall glow
 *   audioChromaHue-> neon color palette follows the musical key
 *
 * Per-activation variety:
 *   buildP float building density (0.7..1.5)
 *   glowP float neon light intensity (0.6..1.8)
 *   fogP float fog density (0.5..1.5)
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

uniform float buildP;
uniform float glowP;
uniform float fogP;
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

float hitMat = 0.0;
vec3 hitCol = vec3(0.0);

// Soft-max, used to carve a smooth clearance bubble around the camera out
// of the distance field: the flight can never clip through geometry -- a
// would-be collision becomes a soft bulge sliding past the lens.
float smax(float a, float b, float k) {
    float h = clamp(0.5 - 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(a, b, h) + k * h * (1.0 - h);
}

float map(vec3 p, float bp)
{
    float d = 1e10;
    float mat = 0.0;

    // City block repetition
    vec3 cp = p;
    vec2 id = floor(cp.xz / 4.0);
    cp.xz = mod(cp.xz, 4.0) - 2.0;

    // Determine building height based on cell
    float h = hash21(id);
    if (h < 0.8 * bp) {
        float height = 2.0 + 8.0 * hash21(id + 1.0);
        // Central gap for the flight path. The camera flies at x = 0 --
        // the BOUNDARY between cell columns -1 and 0 -- so both columns
        // form the street, and its buildings stay low street furniture
        // (the old gap towers reached y = 1.0, the camera's sine low).
        if (id.x > -1.5 && id.x < 0.5) height = 0.45 + 0.30 * hash21(id + 2.0);

        float building = sdBox(cp - vec3(0.0, height - 5.0, 0.0), vec3(1.2, height, 1.2));

        // Add some detail
        float detail = sdBox(cp - vec3(0.0, height * 2.0 - 5.0, 0.0), vec3(0.5, 0.5, 0.5));
        building = min(building, detail);

        if (building < d) { d = building; mat = 1.0; }
    }

    hitMat = mat;
    return d;
}

vec3 calcNormal(vec3 p, float bp)
{
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(
        map(p + e.xyy, bp) - map(p - e.xyy, bp),
        map(p + e.yxy, bp) - map(p - e.yxy, bp),
        map(p + e.yyx, bp) - map(p - e.yyx, bp)));
}

void main()
{
    float bp = (buildP > 0.01 ? buildP : 1.0);
    float glw = (glowP > 0.01 ? glowP : 1.0);
    float fgP = (fogP > 0.01 ? fogP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.1 + audioAdvance * 0.4;

    // Flight down the central corridor
    vec3 ro = vec3(0.0, 2.4 + 0.6 * sin(t * 0.5), t * 15.0);
    vec3 ta = ro + vec3(sin(t * 0.3), -0.2 + 0.5 * cos(t * 0.2), 1.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = 0.08 * sin(t * 0.25);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    int steps = 0;

    for (int i = 0; i < 100; ++i) {
        p = ro + rd * d;
        float ds = map(p, bp);
        ds = smax(ds, 0.50 - length(p - ro), 0.20);   // camera clearance bubble
        m = hitMat;
        steps = i;
        if (ds < 0.005 * (1.0 + d * 0.05)) break;
        d += ds * 0.8;
        if (d > 80.0) { m = 0.0; break; }
    }

    vec3 col = vec3(0.02, 0.01, 0.03); // Deep fog background

    vec3 neonBase1 = imgPalette(0.2);
    vec3 neonBase2 = imgPalette(0.7);

    if (m > 0.5) {
        vec3 n = calcNormal(p, bp);
        vec3 albedo = vec3(0.17, 0.20, 0.25);

        // Windows, PRO FASSADE projiziert: das alte floor(p.xz*2 + p.y*5)
        // vermengte beide Wandrichtungen -- die Muster schwammen und
        // wechselten staendig ("Fehler der Normalen?").
        vec2 face = (abs(n.x) > abs(n.z)) ? p.zy : p.xy;
        vec2 grid = floor(face * vec2(2.0, 5.0));
        float wNoise = hash21(grid);
        float window = step(0.7, wNoise);

        // Only windows on vertical walls
        float isWall = step(0.9, 1.0 - abs(n.y));

        // Animated neon signs
        float neonActive = step(0.93, hash21(floor(face * vec2(0.5, 0.2)) + floor(t * 0.5)));
        vec3 neonColor = mix(neonBase1, neonBase2, hash21(floor(p.xz)));

        col = albedo * (0.55 + 0.45 * clamp(dot(n, vec3(0.0, 1.0, 0.0)), 0.0, 1.0));   // side walls got dot=0 -> near-black canyon

        // Add window lights
        col += vec3(0.8, 0.9, 1.0) * window * isWall * (0.3 + 0.7 * audioLevel) * glw * 0.5;

        // Add neon signs
        col += neonColor * neonActive * isWall * (1.0 + 2.0 * audioKick) * glw;

        // Ambient occlusion
        col *= clamp(1.0 - float(steps) * 0.01, 0.1, 1.0);
    }

    // Add traffic streaks (flying cars)
    float trafficDist = 0.0;
    for(int i = 0; i < 4; i++) {
        vec3 tp = ro + rd * (10.0 + float(i) * 15.0);
        tp.z -= t * 30.0 * (float(i) * 0.2 + 0.8);
        vec2 tCell = floor(tp.xy * 0.5);
        if(hash21(tCell) > 0.8) {
            float streak = exp(-abs(fract(tp.z * 0.1) - 0.5) * 20.0);
            streak *= exp(-abs(fract(tp.x * 0.5) - 0.5) * 20.0);
            vec3 carCol = mix(vec3(1.0, 0.1, 0.1), vec3(0.8, 0.9, 1.0), step(0.5, hash21(tCell+1.0)));
            col += carCol * streak * glw * 2.0 * (1.0 + audioKick);
        }
    }

    // Fog
    float fog = exp(-d * 0.03 * fgP);
    vec3 fogColor = mix(neonBase1, vec3(0.02, 0.01, 0.03), 0.5) * (0.2 + 0.5 * audioSwell);
    col = mix(fogColor * glw, col, fog);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
