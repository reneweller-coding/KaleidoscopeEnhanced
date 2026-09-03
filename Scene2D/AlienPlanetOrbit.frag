#version 330 core
out vec4 fragColor;
/**
 * @file AlienPlanetOrbit.frag
 * @brief ALIEN PLANET ORBIT: A slow orbital flight above a massive alien world,
 * viewing its atmosphere, city lights on the night side, and orbital megastructures.
 * The planet's terminator line separates day and night. Space stations and
 * satellites float in the foreground.
 *   audioAdvance -> orbital progression and station rotation
 *   audioSwell   -> atmospheric glow intensity and station thrusters
 *   audioKick    -> city lights pulsing on the dark side
 *   audioChromaHue-> atmosphere hue follows the musical key
 *
 * Per-activation variety:
 *   planetP float planet size / curvature (0.7..1.5)
 *   stationP float station density (0.5..1.8)
 *   glowP float atmospheric and light intensity (0.6..1.8)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
// Beide zaehlen ab DIESER Aktivierung statt ab Programmstart:
// `time` und `audioAdvance` wachsen unbegrenzt und taugen daher nur
// als Phase, nicht als Position oder Rauschkoordinate.
uniform float sceneTime;
uniform float sceneAdvance;

uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float planetP;
uniform float stationP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

// IMG-PALETTE (house standard)
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

mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// SDF primitives
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Global variables for shading
float hitMat = 0.0;

// Scene SDF
float map(vec3 p, float pr, float sd)
{
    float d = 1e10;
    float mat = 0.0;

    // 1. The Planet (massive sphere below).
    // Die Kamera steht bei y = 0, der Planet lag mit `-pr - 2.0` also nur ZWEI
    // Einheiten unter ihr -- bei Radius 80 ist das kein Orbit, sondern
    // Bodenhoehe: der Horizont sass bei sqrt(82^2 - 80^2) = 18 Einheiten, die
    // Kugel war von einer Ebene nicht zu unterscheiden, streifend beleuchtet,
    // und der ganze obere Bildteil war leerer Himmel.  Ein frueherer Anlauf
    // hat nur die FARBE des Streifens angehoben, nicht seine Groesse.
    // Auf 0.28 * pr Flughoehe: der Planet spannt jetzt rund 51 Grad, seine
    // Kruemmung ist sichtbar, und der Horizont liegt bei 0.79 * pr -- weit
    // innerhalb der Marschgrenze von 200.  Nebenbei steckt damit keine der
    // Stationen mehr in der Oberflaeche (die sitzen bei y = -2 .. +2).
    float planet = sdSphere(p - vec3(0.0, -pr * 1.28, 0.0), pr);
    if(planet < d) { d = planet; mat = 1.0; }

    // 2. Orbital Stations
    // Repeat space in a ring or just sparsely scattered
    vec3 sp = p;
    sp.z = mod(sp.z + 9.0, 18.0) - 9.0; // Repeat along orbit (denser grid)
    sp.x = mod(sp.x + 12.0, 24.0) - 12.0;

    // Check if we are near a station slot
    vec2 id = floor((p.xz + vec2(12.0, 9.0)) / vec2(24.0, 18.0));
    float h = hash21(id);

    if(h < sd * 0.45) {
        // Build a station
        sp.y += 2.0 - 4.0 * hash21(id + 1.0);
        sp.xz *= rot(audioAdvance * 0.1 + h * 6.28);
        sp.xy *= rot(h * 3.14);

        float station = sdBox(sp, vec3(1.5, 0.2, 0.2));
        station = min(station, sdBox(sp, vec3(0.3, 0.8, 0.3)));

        // Solar panels
        vec3 pnl = sp;
        pnl.x = abs(pnl.x) - 1.2;
        float panels = sdBox(pnl, vec3(0.8, 0.05, 0.6));
        station = min(station, panels);

        // Ring section
        float ring = max(length(sp.yz) - 0.7, abs(sp.x) - 0.1);
        ring = max(ring, -(length(sp.yz) - 0.6));
        station = min(station, ring);

        if(station < d) { d = station; mat = 2.0; }
    }

    hitMat = mat;
    return d;
}

vec3 calcNormal(vec3 p, float pr, float sd)
{
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(
        map(p + e.xyy, pr, sd) - map(p - e.xyy, pr, sd),
        map(p + e.yxy, pr, sd) - map(p - e.yxy, pr, sd),
        map(p + e.yyx, pr, sd) - map(p - e.yyx, pr, sd)));
}

// Background stars
vec3 background(vec3 rd, float drift)
{
    vec3 col = vec3(0.005, 0.007, 0.01);
    for (int i = 0; i < 2; ++i) {
        float sc = 100.0 + 100.0 * float(i);
        vec3 sp = rd * sc + vec3(drift * 0.1, 0.0, 0.0);
        vec3 cell = floor(sp);
        vec3 f = fract(sp) - 0.5;
        if (hash31(cell) > 0.98 - 0.005 * float(i)) {
            float d = length(f);
            float b = exp(-d * d * 250.0);
            col += vec3(1.0, 0.9, 0.8) * b;
        }
    }
    return col;
}

void main()
{
    float pr = (planetP > 0.01 ? 80.0 * planetP : 80.0);
    float sd = (stationP > 0.01 ? stationP : 1.0);
    float glw = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = sceneTime * 0.15 + sceneAdvance * 0.35;   // 3x: Stationen ziehen sichtbar vorbei
    float drift = sceneTime * 5.0 + sceneAdvance * 15.0;

    // Camera in orbit
    vec3 ro = vec3(0.0, 0.0, t * 5.0);
    vec3 ta = ro + vec3(0.0, -0.55, 1.0);

    // Slow camera sway
    ro.x += sin(t * 0.4) * 2.0;
    ta.x += sin(t * 0.4 + 0.5) * 2.0;

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = 0.05 * sin(t * 0.3);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    vec3 atmoCol = max(imgPalette(0.1 + 0.2 * audioCentroid), vec3(0.14, 0.22, 0.34));
    vec3 cityCol = max(imgPalette(0.6 + 0.1 * audioKick), vec3(0.55, 0.42, 0.20));

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    int steps = 0;

    for (int i = 0; i < 90; ++i) {
        p = ro + rd * d;
        float ds = map(p, pr, sd);
        m = hitMat;
        steps = i;
        if (ds < 0.005 * (1.0 + d * 0.1)) break;
        d += ds * 0.8;
        if (d > 200.0) { m = 0.0; break; }
    }

    vec3 col = background(rd, drift);

    // Sun direction
    // Sonne hoeher gestellt: bei streifendem Licht stand die Normale des
    // sichtbaren Planetenstuecks (fast senkrecht) bei dif~0.2, und mit einer
    // dunklen Foto-Palette war der Planet komplett schwarz.
    vec3 sunDir = normalize(vec3(0.55, 0.62, 0.55));

    if (m > 0.5) {
        vec3 n = calcNormal(p, pr, sd);
        float dif = max(dot(n, sunDir), 0.0);
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 5.0);

        if (m == 1.0) { // Planet
            // Terrain noise, sampled in a frame that SPINS: the world turns
            // under the camera, so the surface is never a still image.
            vec2 tp = rot(time * 0.02 + audioAdvance * 0.05) * p.xz;
            float terr = sin(tp.x * 0.1) * cos(tp.y * 0.1) + sin(tp.x * 0.5 + tp.y * 0.5) * 0.5
                       + sin(tp.x * 2.3 + tp.y * 1.7) * 0.25;
            // Alien land colours from the photo palette -- WITH a floor: a
            // dark photo made the whole planet black, so the frame was
            // nothing but a station corner on empty space (screening sweep).
            vec3 landTone = max(imgPalette(0.3 + 0.08 * terr) * 0.7,
                                vec3(0.16, 0.19, 0.14));
            vec3 albedo = mix(vec3(0.10, 0.14, 0.20), landTone,
                              clamp(terr * 0.5 + 0.5, 0.0, 1.0));

            // Night side city lights
            float night = smoothstep(0.1, -0.2, dot(n, sunDir));
            float cities = max(0.0, sin(tp.x * 2.0) * cos(tp.y * 2.0) * sin(tp.x * 10.0 + tp.y * 10.0));
            cities = pow(cities, 4.0) * (0.8 + 0.4 * audioKick);

            // Terminator ambient: the night side keeps a trace of skylight
            // instead of falling to pure black.
            col = albedo * (0.30 + dif * 1.7);
            col += cityCol * cities * night * glw * 1.5;

            // Atmosphere rim
            float atmo = fres * smoothstep(-0.2, 0.5, dot(n, sunDir));
            col += atmoCol * atmo * (1.0 + audioSwell * 0.5) * glw;
        }
        else if (m == 2.0) { // Station
            vec3 albedo = vec3(0.5);
            col = albedo * (0.1 + dif * 1.5);
            col += vec3(0.5, 0.7, 1.0) * fres * 0.5;

            // Station lights
            float lts = step(0.9, hash21(floor(p.xy * 4.0))) * smoothstep(0.32, 0.12, length(fract(p.xy * 4.0) - 0.5));   // round lights, not cells (V8e)
            col += cityCol * lts * (0.5 + 0.5 * audioLevel) * glw;

            // AO
            col *= clamp(1.0 - float(steps) * 0.015, 0.2, 1.0);
        }
    }

    // Add atmospheric scatter behind everything
    if (m == 0.0 || m == 2.0) {
        // Ray intersect with atmosphere sphere (radius slightly larger than planet)
        vec3 oc = ro - vec3(0.0, -pr - 2.0, 0.0);
        float b = dot(oc, rd);
        float c = dot(oc, oc) - (pr + 4.0) * (pr + 4.0);
        float h = b * b - c;
        if(h > 0.0) {
            float atmoHit = -b - sqrt(h);
            if(atmoHit > 0.0 && (m == 0.0 || atmoHit < d)) {
                float atmoGlow = exp(-atmoHit * 0.01) * (0.5 + audioSwell * 0.3);
                col += atmoCol * atmoGlow * glw * 0.4;
            }
        }
    }

    // FOREGROUND SATELLITES: three fast crossers with blinking nav lights --
    // constant visible motion even between the big station encounters.
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float x = fract(t * (0.5 + 0.3 * fi) + fi * 0.37) * 2.6 - 1.3;
        float y = -0.28 + 0.24 * fi + 0.05 * sin(t * 3.0 + fi * 5.0);
        vec2 d2 = ruv - vec2(x, y);
        float body = exp(-dot(d2, d2) * 9000.0);
        float blink = pow(0.5 + 0.5 * sin(time * 6.0 + fi * 2.1), 6.0);
        col += (vec3(0.8, 0.9, 1.0) * 0.8 + cityCol * blink * 2.0) * body * glw;
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
