#version 330 core
out vec4 fragColor;
/**
 * @file ButterflyWingScales.frag
 * @brief BUTTERFLY WING SCALES: gliding low over a butterfly's wing under the
 * microscope -- rows of tiny overlapping scales laid like roof tiles, each
 * a rounded paddle with fine ridges along it, and the colour in them is
 * structural: iridescent blue shifting to violet and green as the angle
 * changes, like a morpho's wing, broken by a band of the wing's pattern
 * where the scales turn black and a patch where they turn orange.  The
 * scales ripple slightly as the view glides steadily across the wing.
 *
 * Audio Reactivity:
 *   audioSwell  -> the iridescent sheen (slow)
 *   audioHigh   -> sparkle on the scale ridges (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the glide across the wing (constant speed)
 *
 * Per-activation variety: patternP (the wing's pattern), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float patternP;
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
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

// Thin-film interference colour for a phase (the sheen of the scales).
vec3 filmColour(float ph)
{
    return 0.5 + 0.5 * cos(6.2831853 * (ph + vec3(0.0, 0.33, 0.67)));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float px = 1.0 / resolution.y;

    // The wing plane in slight perspective, gliding steadily.
    float persp = 1.0 / (1.0 - p.y * 0.35);
    vec2 w = vec2(p.x * persp, p.y * persp) * 7.0 + vec2(T * 0.25, T * 0.08);
    // The wing's pattern: a dark band and an orange patch, large scale.
    float pat = fbm(w * 0.06 + clamp(patternP, 0.0, 1.0) * 5.0);
    float band = smoothstep(0.02, 0.0, abs(pat - 0.5) - 0.06);
    float patch = smoothstep(0.62, 0.66, fbm(w * 0.05 + 11.0));

    // Scales: rows offset like roof tiles; each rounded at its free (lower)
    // end, overlapping the row below.  Draw the two candidate scales that
    // can cover this point, the upper row on top.
    vec3 col = vec3(0.02, 0.02, 0.03);                        // the dark membrane between
    float covered = 0.0;
    // The row above reaches down over this one with its tips, so it is on top.
    // Derivatives before the loops (undefined after a pixel-dependent continue).
    float fwY = fwidth(w.y) * 1.2;
    float rfw = fwidth(w.x) * 70.0;                          // q.x jumps between rows
    for (int r = 1; r >= 0; --r) {
        float row = floor(w.y) + float(r);
        float off = 0.5 * mod(row, 2.0);
        float cx = floor(w.x - off) + 0.5 + off;
        for (int k = -1; k <= 1; ++k) {
            float c = cx + float(k);
            vec2 id = vec2(c, row);
            // Local coordinates: u across, v along (0 at the socket, 1.3 at the tip).
            vec2 q = vec2(w.x - c, (row + 1.0) - w.y);
            q.x += 0.05 * sin(q.y * 3.0 + hash21(id) * 6.0 + T * 0.2);   // a slight ripple
            float halfW = 0.46 * (0.9 + 0.1 * hash21(id + 1.0));
            float len = 1.35;
            // A paddle: straight sides, a rounded tip with a scalloped edge.
            float tip = length(vec2(q.x, max(q.y - (len - halfW), 0.0))) - halfW;
            float side = max(abs(q.x) - halfW, -q.y);
            float d = max(side, tip) + 0.02 * sin(atan(q.x, q.y - len + halfW) * 5.0) * step(len - halfW, q.y);
            float fw = fwY;
            float cov = smoothstep(fw, -fw, d) * step(0.0, q.y);
            if (cov <= 0.0) continue;
            // Structural colour: phase from the scale's tilt and the view.
            float tilt = hash21(id + 3.0) * 0.3 + 0.12 * q.x + 0.05 * q.y;
            float ph = 0.55 + tilt + 0.15 * sin(w.x * 0.2 + T * 0.05) + hueP * 0.2;
            vec3 irid = filmColour(ph) * vec3(0.4, 0.7, 1.2);
            irid = mix(irid, vec3(0.05, 0.35, 1.0), 0.45) * (0.85 + 0.5 * swell);
            // The ridges along each scale: fine lines catching light.
            float ridges = 0.5 + 0.5 * cos(q.x * 70.0);
            ridges = mix(ridges, 0.5, smoothstep(1.0, 3.0, rfw));
            vec3 sc = irid * (0.75 + 0.3 * ridges);
            sc += vec3(0.7, 0.85, 1.0) * pow(ridges, 12.0) * (0.2 + 1.0 * hi) * smoothstep(0.3, 1.0, q.y);
            // Pattern scales: black in the band, orange in the patch.
            sc = mix(sc, vec3(0.02, 0.02, 0.025) + 0.05 * ridges, band);
            sc = mix(sc, vec3(1.0, 0.45, 0.08) * (0.7 + 0.35 * ridges), patch * (1.0 - band));
            sc = mix(sc, sc * imgPalette(0.6 + hueP * 0.159) * 1.3, 0.06);
            // The edge shadow the upper scale casts onto the one below.
            sc *= 0.55 + 0.45 * smoothstep(0.0, 0.35, q.y);
            // The tip edge is slightly brighter (it lifts off the wing).
            sc += irid * 0.25 * smoothstep(-0.08, 0.0, d);
            col = mix(col, sc, cov * (1.0 - covered));
            covered = max(covered, cov);
        }
    }
    // Depth of field: the far part of the view softens into a haze of colour.
    col = mix(col, vec3(0.05, 0.2, 0.55) * (0.6 + 0.4 * swell), smoothstep(0.25, 0.5, p.y) * 0.5);
    col *= 1.0 - 0.3 * smoothstep(-0.3, -0.5, p.y);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
