#version 330 core
out vec4 fragColor;
/**
 * @file CalatravaRibsHall.frag
 * @brief CALATRAVA RIBS HALL: gliding through a vast white hall built of ribs,
 * after Calatrava's Oculus -- white steel ribs rising in an ellipse on
 * both sides like the skeleton of a great animal, glass between them, the
 * ribs parting at the top along a long skylight spine, the polished
 * marble floor mirroring everything.  Along the inner edge of each rib
 * runs a line of light; one after another the ribs light up with the
 * bands of the music, so light runs through the hall in the rhythm.  The
 * camera glides forward at a slow, even pace.
 *
 * The hall is traced analytically: an inner and an outer elliptical shell,
 * the ribs as slabs between them.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the light lines of the ribs, one band per rib (light)
 *   audioSwell        -> the sky's brightness through the glass (slow)
 *   audioLevel        -> brightness
 *   sceneTime / sceneAdvance -> the glide (constant speed)
 *
 * Per-activation variety: ribP (rib spacing), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float ribP;
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

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

const float HW = 3.2, HH = 5.5;   // the hall's half width at the floor and its height
const float INNER = 0.86;          // the ribs' inner edge (scale of the shell)
const float RIBW = 0.22;           // rib thickness along the hall
const float SPINE = 0.55;          // half width of the skylight spine
float gSp;                         // rib spacing
float gSwell;
float gBand[8];

// Far root of the ray with an elliptic cylinder of the given scale.
float shell(vec3 ro, vec3 rd, float k)
{
    vec2 a = vec2(k * HW, k * HH);
    vec2 o = ro.xy / a, d = rd.xy / a;
    float A = dot(d, d), B = dot(o, d), C = dot(o, o) - 1.0;
    float disc = B * B - A * C;
    if (disc < 0.0 || A < 1e-8) return 1e9;
    return (-B + sqrt(disc)) / A;
}

vec3 sky(vec3 d)
{
    return mix(vec3(0.6, 0.75, 0.95), vec3(1.0, 1.0, 1.0), smoothstep(0.2, 0.95, d.y)) * (1.3 + 0.5 * gSwell);
}

// The hall along a ray (without the floor): ribs, glass, the spine.
vec3 hall(vec3 ro, vec3 rd, out float tHit)
{
    float tIn = shell(ro, rd, INNER);
    float tOut = shell(ro, rd, 1.0);
    vec3 Pin = ro + rd * tIn;
    tHit = tOut;
    vec3 white = vec3(0.92, 0.92, 0.9);
    // In the spine gap there are no ribs: sky.
    bool spineIn = abs(Pin.x) < SPINE && Pin.y > 0.0;
    // The rib that the inner hit lies in, if any.
    float zr = Pin.z / gSp;
    float kIn = floor(zr + 0.5);
    float inRib = step(abs(Pin.z - kIn * gSp), RIBW * 0.5);
    if (!spineIn && inRib > 0.5) {
        tHit = tIn;
        // The inner edge: white, with its line of light.
        float b = gBand[int(mod(kIn, 8.0))];
        vec3 lc = mix(vec3(1.0, 0.92, 0.8), imgPalette(0.1 + hueP * 0.159 + mod(kIn, 8.0) * 0.05) * 1.4, 0.35);
        float mid = exp(-pow((Pin.z - kIn * gSp) / (RIBW * 0.18), 2.0));
        return white * 0.8 + lc * mid * (0.15 + 2.4 * b) * exp(-tIn * 0.04);
    }
    // Between the shells: the ray may meet the face of the next rib ahead.
    float zOut = (ro + rd * tOut).z;
    float zFace = (floor((Pin.z + RIBW * 0.5) / gSp) + 1.0) * gSp - RIBW * 0.5;
    if (rd.z > 0.0 && zFace < zOut) {
        float tf = (zFace - ro.z) / rd.z;
        vec3 Pf = ro + rd * tf;
        if (abs(Pf.x) > SPINE || Pf.y < 0.0) {
            tHit = tf;
            // The face of the rib: white, shaded darker toward the glass.
            float k = length(Pf.xy / vec2(HW, HH));
            float sh = mix(0.95, 0.62, smoothstep(INNER, 1.0, k));
            return white * sh;
        }
    }
    // Glass (or the open spine): the sky through the mullions.
    vec3 Po = ro + rd * tOut;
    vec3 sk = sky(normalize(vec3(Po.x, Po.y + 2.0, 0.0)));
    if (abs(Po.x) < SPINE) return sk * 1.25;                   // the open skylight
    // Mullions run along the arc between the ribs.
    float ang = atan(Po.y / HH, abs(Po.x) / HW);
    float mf = ang / 1.5708 * 7.0;
    float mull = smoothstep(fwidth(mf) * 1.5 + 0.03, 0.0, abs(fract(mf) - 0.5) - 0.45);
    return mix(sk, white * 0.7, mull * 0.5);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    gSwell = clamp(audioSwell, 0.0, 1.0);
    gSp = 1.1 + 0.8 * clamp(ribP, 0.0, 1.0);
    for (int i = 0; i < 8; ++i)
        gBand[i] = clamp((audioSpectrum[i * 4] + audioSpectrum[i * 4 + 1] + audioSpectrum[i * 4 + 2] + audioSpectrum[i * 4 + 3]) * (0.35 + 0.1 * float(i)), 0.0, 1.0);

    // Gliding along the hall at an even pace, eyes level, a little off centre.
    vec3 ro = vec3(0.35, 1.7, T * 0.5);
    vec3 rd = normalize(vec3(p.x, p.y + 0.12, 1.0));

    vec3 col;
    float tF = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
    float tH;
    vec3 hc = hall(ro, rd, tH);
    if (tF < tH) {
        // The polished marble floor mirrors the hall.
        vec3 P = ro + rd * tF;
        vec3 rr = vec3(rd.x, -rd.y, rd.z);
        float tR;
        vec3 refl = hall(P + rr * 0.01, rr, tR);
        refl = mix(refl, vec3(0.85, 0.87, 0.9), 1.0 - exp(-tR * 0.02));
        float vein = noise2(P.xz * vec2(0.7, 2.0)) * 0.5 + noise2(P.xz * 4.0) * 0.5;
        vec3 marble = vec3(0.78, 0.78, 0.76) * (0.9 + 0.1 * vein);
        float fres = 0.35 + 0.45 * pow(1.0 - abs(rd.y), 4.0);
        col = mix(marble * 0.75, refl, fres);
        // Seams of the floor slabs.
        col *= 0.92 + 0.08 * smoothstep(0.0, 0.03, abs(fract(P.x * 0.5) - 0.5));
        tH = tF;
    } else {
        col = hc;
    }
    // Distance haze: the far end of the hall dissolves into bright air.
    col = mix(col, vec3(0.9, 0.92, 0.95), 1.0 - exp(-tH * 0.035));

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
