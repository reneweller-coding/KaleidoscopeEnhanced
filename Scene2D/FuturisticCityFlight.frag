#version 330 core
out vec4 fragColor;
/**
 * @file FuturisticCityFlight.frag
 * @brief FUTURISTIC CITY FLIGHT: a low, steady flight down one street of a
 * night city.  Towers line both sides of the canyon, their windows lit in a
 * pattern that holds still, neon signs on the street walls, traffic lights
 * streaming through the canyon above the car, fog closing the far end.
 *
 * REBUILT.  The previous versions raymarched a city-block lattice with a
 * corridor cut through it, and three things about that never worked
 * (reported three times as "pure chaos"): the corridor's floor sat five units
 * below the camera, so there was no street to fly along; the buildings were
 * boxes on a 4-unit lattice with a detail cube on top, so the canyon had no
 * walls, only a field of stumps; and the window pattern was computed from a
 * finite-difference normal that flipped between wall directions at every
 * lattice seam, so the windows rewrote themselves every frame.
 *
 * Now the city is one street: a flat road at y = 0, and on each side a row
 * of buildings, one per block along z, each with its own width, height and
 * setback from the kerb.  The distance field is six boxes (the block the
 * point is in and its two neighbours, on both sides) plus the road, so it
 * costs almost nothing and has no seams.  The normal is ANALYTIC -- read off
 * whichever face of the nearest box is closest -- so a wall is a wall, and
 * its windows are indexed in that wall's own coordinates.  Nothing about a
 * building depends on where the camera is.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> the flight (continuous, camera on the scene clock only)
 *   audioKick       -> the neon signs and the headlights flare (light)
 *   audioLevel      -> how many windows are lit (light, slow ramp)
 *   audioSwell      -> the fog and the sky glow (slow)
 *   audioChromaHue  -> the neon palette follows the key (colour)
 *
 * Per-activation variety: buildP (tower height), glowP, fogP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float sceneTime;
uniform float sceneAdvance;

uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;
uniform float audioHigh;

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

// ---- the street ------------------------------------------------------------
const float STREET_HALF = 4.6;     // kerb to kerb, the camera weaves well inside
const float BLOCK       = 9.0;     // one building per block along z

// A building's footprint and height from its block index and side.
void building(float k, float side, float bp,
              out vec3 centre, out vec3 half_)
{
    float h1 = hash11(k * 3.7 + side * 17.1);
    float h2 = hash11(k * 5.3 + side * 29.3);
    float h3 = hash11(k * 7.9 + side * 41.7);
    float height  = (6.0 + 18.0 * h1 * h1) * bp;          // a few tall, most mid
    float halfW   = 2.2 + 3.0 * h2;                          // across the street
    float setback = 0.4 + 2.2 * h3;                          // from the kerb
    float halfD   = BLOCK * (0.34 + 0.10 * hash11(k * 2.1 + side * 3.3));  // along z
    centre = vec3(side * (STREET_HALF + setback + halfW), height * 0.5,
                  (k + 0.5) * BLOCK);
    half_  = vec3(halfW, height * 0.5, halfD);
}

float sdBox(vec3 p, vec3 c, vec3 h)
{
    vec3 q = abs(p - c) - h;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Distance to the city, and which box was nearest (for the analytic normal).
vec3  gC, gH;          // the nearest box, handed back to the shader
float gSide, gBlock;
float mapCity(vec3 p, float bp)
{
    float d = p.y;                          // the road
    gSide = 0.0; gBlock = 0.0;
    float k0 = floor(p.z / BLOCK);
    for (int s = 0; s < 2; ++s)
    {
        float side = (s == 0) ? -1.0 : 1.0;
        for (int j = -1; j <= 1; ++j)
        {
            float k = k0 + float(j);
            vec3 c, h;
            building(k, side, bp, c, h);
            float db = sdBox(p, c, h);
            if (db < d) { d = db; gC = c; gH = h; gSide = side; gBlock = k; }
        }
    }
    return d;
}

// The normal of the nearest surface, read off the nearest box face -- no
// finite differences, so nothing flips at a seam.
vec3 normalCity(vec3 p)
{
    if (gSide == 0.0) return vec3(0.0, 1.0, 0.0);     // the road
    vec3 q = (p - gC) / gH;
    vec3 a = abs(q);
    if (a.x > a.y && a.x > a.z) return vec3(sign(q.x), 0.0, 0.0);
    if (a.y > a.z)              return vec3(0.0, sign(q.y), 0.0);
    return vec3(0.0, 0.0, sign(q.z));
}

void main()
{
    float bp  = (buildP > 0.01) ? buildP : 1.0;
    float glw = (glowP  > 0.01) ? glowP  : 1.0;
    float fgP = (fogP   > 0.01) ? fogP   : 1.0;
    float hue = (hueP   > 0.01) ? hueP   : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // The flight: a steady speed on the scene clock, a slow lane weave, no
    // roll, a whisper of pitch.  Nothing here follows a fast envelope.
    float T = sceneTime * 4.0 + sceneAdvance * 6.0;
    vec3 ro = vec3(0.9 * sin(sceneTime * 0.11 + sceneAdvance * 0.05), 1.7, T);
    vec3 rd = normalize(vec3(uv.x, uv.y + 0.02, 1.15));

    // ---- march ----
    float d = 0.0;
    vec3  p = ro;
    bool  hit = false;
    for (int i = 0; i < 110; ++i)
    {
        p = ro + rd * d;
        float ds = mapCity(p, bp);
        if (ds < 0.004 * (1.0 + d * 0.06)) { hit = true; break; }
        d += ds * 0.9;
        if (d > 140.0) break;
    }

    vec3 neonA = max(imgPalette(0.15), vec3(0.20, 0.16, 0.34));
    vec3 neonB = max(imgPalette(0.62), vec3(0.34, 0.14, 0.26));

    // The sky at the end of the canyon: a night haze that carries the neon.
    float up  = clamp(rd.y * 2.2 + 0.25, 0.0, 1.0);
    vec3  sky = mix(neonA * 0.55, vec3(0.03, 0.02, 0.07), up)
              * (0.45 + 0.45 * clamp(audioSwell, 0.0, 1.0));
    vec3  col = sky;

    if (hit)
    {
        mapCity(p, bp);                      // refresh the nearest-box record
        vec3 n = normalCity(p);

        if (gSide == 0.0)
        {
            // ---- the road ----
            vec3 asphalt = vec3(0.045, 0.045, 0.055);
            // Lane markings: a dashed centre line and solid kerb lines.
            float dash = step(0.55, fract(p.z * 0.20)) * smoothstep(0.10, 0.04, abs(p.x));
            float kerb = smoothstep(0.14, 0.06, abs(abs(p.x) - STREET_HALF + 0.35));
            col = asphalt + vec3(0.55, 0.50, 0.30) * (dash * 0.55 + kerb * 0.35);
            // Wet asphalt: the neon of the walls mirrors faintly in it.
            float wet = pow(1.0 - clamp(-rd.y, 0.0, 1.0), 3.0);
            col += mix(neonA, neonB, 0.5 + 0.5 * sin(p.z * 0.05)) * wet * 0.25 * glw;
        }
        else
        {
            // ---- a building ----
            vec3 base = vec3(0.10, 0.11, 0.15);
            float wall = 1.0 - abs(n.y);
            float bid  = gBlock * 2.0 + gSide;                 // one id per building

            // Windows in the WALL'S OWN coordinates: the street wall counts
            // along z, an end wall along x, both count up y.  A fixed lattice
            // per building, so the pattern never rewrites itself.
            vec2 face = (abs(n.x) > 0.5) ? vec2(p.z, p.y) : vec2(p.x, p.y);
            vec2 cell = floor(face / vec2(1.25, 0.95));
            vec2 cf   = fract(face / vec2(1.25, 0.95));
            float pane = smoothstep(0.14, 0.22, cf.x) * smoothstep(0.86, 0.78, cf.x)
                       * smoothstep(0.16, 0.26, cf.y) * smoothstep(0.84, 0.74, cf.y);
            float seed = hash21(cell + bid * 0.37);
            // Which windows are lit is fixed; how MANY is a slow ramp on the
            // level; a lit one glows gently on a continuous, personal phase.
            float litAt = 0.42 + 0.30 * clamp(audioLevel, 0.0, 1.0);
            float lit   = smoothstep(litAt + 0.04, litAt - 0.04, seed);
            float breathe = 0.75 + 0.25 * sin(sceneTime * 0.6 + seed * 40.0);
            // Under the roofline the top row is dark plant floor.
            lit *= step(p.y, gC.y + gH.y - 1.4);
            vec3 warm = mix(vec3(1.0, 0.86, 0.62), vec3(0.72, 0.86, 1.0), hash21(cell * 1.7 + bid));

            col = base * (0.35 + 0.65 * clamp(0.5 + 0.5 * n.y, 0.0, 1.0));
            col += warm * pane * lit * breathe * wall * 0.85 * glw;

            // A neon sign on the street wall: one strip per building, low on
            // the facade, its colour from the palette, its light on the kick.
            if (abs(n.x) > 0.5)
            {
                float sx = hash11(bid * 1.9);
                float signZ = gC.z + (sx - 0.5) * gH.z * 1.2;
                float signY0 = 2.5 + 3.0 * hash11(bid * 3.1);
                float sign = smoothstep(0.35, 0.10, abs(p.z - signZ))
                           * smoothstep(0.0, 0.3, p.y - signY0) * smoothstep(signY0 + 3.2, signY0 + 2.9, p.y);
                vec3 signCol = mix(neonA, neonB, hash11(bid * 5.7)) * 2.2;
                col += signCol * sign * (0.6 + 1.1 * clamp(audioKick, 0.0, 1.0)) * glw;
            }
            // The roofline catches the sky.
            col += sky * 0.5 * clamp(n.y, 0.0, 1.0);
        }
    }

    // ---- traffic: lights streaming through the canyon ----
    // Four lanes at two heights.  Each vehicle is a point moving along z at
    // its own steady speed; what is drawn is the glow of its light where the
    // ray passes closest to it.  Nothing pops: they wrap far behind the fog.
    for (int i = 0; i < 6; ++i)
    {
        float fi = float(i);
        float laneX = (mod(fi, 2.0) < 0.5 ? -1.0 : 1.0) * (1.4 + 1.2 * hash11(fi * 2.3));
        float laneY = 3.2 + 3.4 * hash11(fi * 4.1);
        // Speed as a multiple of the camera's own: above one pulls ahead,
        // below one drops back, negative is oncoming.
        float speed = (mod(fi, 2.0) < 0.5) ? (1.3 + 0.7 * hash11(fi * 6.7))
                                           : -(1.0 + 0.8 * hash11(fi * 6.7));
        float span  = 160.0;
        float zc    = ro.z + mod(hash11(fi * 8.9) * span + (speed - 1.0) * T, span) - 40.0;
        vec3  car   = vec3(laneX, laneY, zc);
        // Closest approach of the ray to the car.
        float along = clamp(dot(car - ro, rd), 0.0, d);
        float miss  = length(ro + rd * along - car);
        vec3  lamp  = (speed > 0.0) ? vec3(1.0, 0.25, 0.15) : vec3(0.85, 0.92, 1.0);
        float glow  = exp(-miss * miss * 6.0) * (1.0 + 0.8 * clamp(audioKick, 0.0, 1.0));
        col += lamp * glow * glw * 0.9 * (1.0 - smoothstep(60.0, 120.0, along));
    }

    // ---- fog closes the far end ----
    float fog = exp(-d * 0.020 * fgP);
    vec3  fogCol = mix(neonA, vec3(0.02, 0.015, 0.05), 0.55) * (0.3 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    // A miss is the sky as set above; a hit fades into the fog with distance.
    if (hit) col = mix(fogCol * glw, col, fog);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
