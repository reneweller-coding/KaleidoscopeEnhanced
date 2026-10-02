#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file PantheonOculusShaft.frag
 * @brief PANTHEON OCULUS SHAFT: inside the Pantheon, looking up into the
 * coffered dome -- rings of stepped coffers shrinking toward the open
 * oculus at the top, where the sky shows white-blue, and through it the
 * sun drives a solid column of light down through the dusty air, so
 * dense you could touch it, landing as a bright disc on the coffers and
 * the drum below.  The disc creeps across the dome as the sun moves, its
 * light making every step of the coffers stand out; dust motes glitter
 * in the shaft.  The camera is still.
 *
 * The dome and drum are ray-traced (a sphere on a cylinder); the shaft is
 * the exact length of the view ray inside the beam's cylinder.
 *
 * Audio Reactivity:
 *   audioSwell  -> the dust in the shaft (slow)
 *   audioHigh   -> the glitter of the motes (light)
 *   audioBass   -> the sunlight's strength (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the sun's slow travel, drifting dust
 *
 * Per-activation variety: sunP (the sun's height), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float sunP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

const float OCR = 0.16;          ///< oculus radius (sine of its angle)
const vec3  OC  = vec3(0.0, 0.987, 0.0);

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;

    // Standing on the floor off centre, looking up into the dome.
    vec3 ro = vec3(0.12, -0.72, 0.42);
    vec3 fw = normalize(vec3(-0.08, 1.0, -0.62));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(p.x * rt + p.y * up + 1.05 * fw);

    // The sun: its light travels down through the oculus, tilted, and
    // swings slowly around (the disc creeps over the coffers).
    float sEl = 0.5 + 0.3 * clamp(sunP, 0.0, 1.0);
    float sAz = -1.57 + 0.55 * sin(T * 0.005 + 1.0);
    vec3 sd = normalize(vec3(cos(sAz) * cos(sEl), -sin(sEl), sin(sAz) * cos(sEl)));   // light travels along sd
    float sunI = 1.0 + 0.5 * bass;

    // Hit the dome (sphere) or the drum (cylinder below the equator).
    float b = dot(ro, rd), c = dot(ro, ro) - 1.0;
    float t = -b + sqrt(max(b * b - c, 0.0));
    vec3 H = ro + rd * t;
    bool drum = false;
    if (H.y < 0.0) {
        float a2 = dot(rd.xz, rd.xz), b2 = dot(ro.xz, rd.xz), c2 = dot(ro.xz, ro.xz) - 1.0;
        t = (-b2 + sqrt(max(b2 * b2 - a2 * c2, 0.0))) / a2;
        H = ro + rd * t;
        drum = true;
    }

    // The sunlit disc: points whose line back toward the sun passes
    // through the oculus.
    vec3 v = H - OC;
    float along = dot(v, sd);
    float perp = length(v - sd * along);
    float patch = smoothstep(OCR + 0.02, OCR - 0.02, perp) * step(0.0, along);

    vec3 marble = vec3(0.72, 0.66, 0.58);
    vec3 col;
    float amb = 0.3;
    if (!drum && H.y > sqrt(1.0 - OCR * OCR)) {
        // The oculus: open sky.
        col = mix(vec3(0.95, 0.97, 1.0) * 2.2, vec3(0.5, 0.68, 0.95) * 1.5, smoothstep(0.02, OCR, length(H.xz)));
    } else if (!drum) {
        // The coffered dome: five rings of 28 coffers above a plain band.
        float phi = atan(H.z, H.x);
        float el = asin(clamp(H.y, -1.0, 1.0));
        float u = fract(phi / 6.2831853 * 28.0);
        float rowF = (el - 0.12) / 0.2;
        float lum;
        vec3 n = -H;                                           // inward normal of the dome
        if (rowF > 0.0 && rowF < 5.0) {
            float vv = fract(rowF);
            vec2 q = vec2(u - 0.5, vv - 0.5);
            float e = max(abs(q.x), abs(q.y)) * 2.0;
            // Four receding steps inside each coffer's frame.
            float lev = clamp(floor((0.84 - e) / 0.17) + 1.0, 0.0, 4.0);
            float onBevel = smoothstep(0.03, 0.0, abs(fract((0.84 - e) / 0.17) - 0.02)) * step(e, 0.84);
            // Which way the step's face looks (in the coffer's frame).
            vec2 fdir = abs(q.x) > abs(q.y) ? vec2(sign(q.x), 0.0) : vec2(0.0, sign(q.y));
            // The dome's local axes: east (along phi) and north (up the dome).
            vec3 east = normalize(vec3(-sin(phi), 0.0, cos(phi)));
            vec3 north = normalize(cross(H, east));
            vec3 fn = normalize(n - 0.9 * (fdir.x * east + fdir.y * north));
            float sunFace = max(dot(fn, -sd), 0.0);
            lum = mix(1.0, 0.55, lev / 4.0) * amb * (1.0 + 0.6 * onBevel * (0.5 - sunFace));
            float lit = mix(max(dot(n, -sd), 0.0), sunFace * (1.0 + onBevel), step(0.5, lev));
            col = marble * (lum + patch * sunI * 1.6 * (0.35 + 0.9 * lit));
            // A rosette in the deepest step (once gilded).
            col += vec3(0.9, 0.75, 0.4) * smoothstep(0.08, 0.05, length(q)) * (0.05 + patch * 0.6);
        } else {
            col = marble * (amb + patch * sunI * 1.4 * max(dot(n, -sd), 0.0));
        }
    } else {
        // The drum: marble walls with column pairs and niches, a cornice.
        float phi = atan(H.z, H.x);
        float u = fract(phi / 6.2831853 * 16.0);
        float colm = smoothstep(0.03, 0.02, abs(fract(u * 2.0) - 0.5) - 0.18);
        float niche = smoothstep(0.02, 0.0, abs(u - 0.5) - 0.2) * step(H.y, -0.08) * step(-0.6, H.y);
        vec3 wallC = mix(marble, vec3(0.5, 0.3, 0.26), 0.2 * smoothstep(0.02, 0.0, abs(u - 0.5) - 0.12) * step(H.y, -0.1));
        wallC = mix(wallC, marble * 0.9, colm);
        float lum = amb * (1.0 - 0.5 * niche);
        float corn = smoothstep(0.012, 0.0, abs(H.y + 0.04)) + smoothstep(0.012, 0.0, abs(H.y + 0.62));
        col = wallC * (lum + patch * sunI * 1.5) + marble * corn * 0.15;
    }
    col = mix(col, col * imgPalette(0.1 + hueP * 0.159) * 1.3, 0.1);

    // The shaft: the length of the view ray inside the beam cylinder.
    {
        vec3 w0 = ro - OC;
        vec3 dp = rd - sd * dot(rd, sd);
        vec3 wp = w0 - sd * dot(w0, sd);
        float A = dot(dp, dp), B = 2.0 * dot(dp, wp), C = dot(wp, wp) - OCR * OCR;
        float disc = B * B - 4.0 * A * C;
        if (disc > 0.0) {
            float sq = sqrt(disc);
            float t0 = max((-B - sq) / (2.0 * A), 0.0);
            float t1 = min((-B + sq) / (2.0 * A), t);
            // Only below the oculus (the beam starts there).
            float tO = dot(OC - ro, sd) / min(dot(rd, sd), -1e-4);
            if (dot(rd, sd) < 0.0) t1 = min(t1, max(tO, 0.0) + 1e9 * 0.0);
            float L = max(t1 - t0, 0.0);
            float dens = 0.7 + 0.3 * noise2(p * 6.0 + vec2(0.0, T * 0.05));
            col += vec3(1.0, 0.93, 0.8) * L * dens * (0.25 + 0.35 * swell) * sunI;
            // Dust motes: round, drifting slowly, glittering.
            if (L > 0.0) {
                vec2 g = p * 70.0 + vec2(T * 0.15, -T * 0.25), gi = floor(g), gf = fract(g);
                vec2 gc = 0.25 + 0.5 * vec2(hash21(gi), hash21(gi + 3.0));
                float tw = 0.5 + 0.5 * sin(T * 2.0 + hash21(gi + 7.0) * 40.0);
                float mote = smoothstep(0.13, 0.0, length(gf - gc)) * step(0.82, hash21(gi + 5.0));
                col += vec3(1.0, 0.95, 0.85) * mote * tw * min(L * 4.0, 1.0) * (0.25 + 0.9 * hi) * (0.6 + 0.6 * swell);
            }
        }
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
