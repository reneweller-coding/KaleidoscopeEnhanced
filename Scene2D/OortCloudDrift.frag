#version 330 core
out vec4 fragColor;
/**
 * @file OortCloudDrift.frag
 * @brief OORT CLOUD DRIFT: the million-year fall from the Oort cloud to the
 * Sun as one endless zoom.  Icy bodies hang in shells at every scale; in
 * log-polar space the shells repeat with a fixed period, so the zoom is
 * periodic and its wrap invisible, and the Sun waits at the centre as a
 * glow that never arrives.  Onsets ignite comets: a body near the onset
 * grows a tail pointing away from the Sun, its brightness the onset
 * envelope -- light, not motion.  The zoom runs on the music's pace.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the fall (music-paced, periodic, seamless)
 *   audioOnset   -> comet tails ignite (envelope, light)
 *   audioLevel   -> the Sun's glow
 *   audioSwell   -> dust haze (slow)
 *   audioHigh    -> sparkle of the ice
 *
 * Per-activation variety: zoomP (fall rate), densP (body density), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioChromaHue;
uniform float audioValence;

uniform float zoomP;
uniform float densP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2  hash22(vec2 p) { return vec2(hash21(p), hash21(p + 19.7)); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue  = (hueP > 0.001) ? hueP : 0.0;
    float dens = 0.5 + 0.5 * clamp(densP, 0.0, 1.0);
    const float L = 1.0;                                  // log-radius period of the shells
    float zoom = sceneAdvance * 0.22 * (zoomP > 0.05 ? zoomP : 1.0) + sceneTime * 0.03;

    float r = length(p);
    float th = atan(p.y, p.x);
    // Log-polar with the zoom: the pattern is periodic in rho with period L,
    // so the wrap of the zoom is a symmetry.
    float rho = log(r + 1e-5) - zoom;

    // Cells in (rho, theta): each holds one body, offset randomly.  Three
    // layers of cell scale for depth.
    vec3 col = vec3(0.0);
    float onset = clamp(audioOnset, 0.0, 1.0);
    for (int layer = 0; layer < 3; ++layer)
    {
        float sc = 6.0 * pow(1.7, float(layer));           // cells per unit rho
        float ang = 5.0 * pow(1.7, float(layer));           // cells per radian
        vec2 c = vec2(rho * sc, th * ang);
        // Neighbouring cells so bodies can cross cell borders.
        for (int dx = -1; dx <= 1; ++dx)
        for (int dy = -1; dy <= 1; ++dy)
        {
            vec2 cell = floor(c) + vec2(float(dx), float(dy));
            // Periodicity in rho: wrap the cell index so the zoom loops.
            vec2 key = vec2(mod(cell.x, L * sc), mod(cell.y, 6.2831853 * ang));
            vec2 h = hash22(key + float(layer) * 31.0);
            if (h.x > dens) continue;
            vec2 centre = cell + 0.5 + (hash22(key + 7.0) - 0.5) * 0.8;
            vec2 d = (c - centre) * vec2(1.0, 1.0);
            float dist = length(d);
            float size = 0.05 + 0.12 * h.y;
            float body = exp(-dist * dist / (size * size)) ;
            vec3 ice = imgPalette(hue * 0.159 + 0.55 + 0.3 * h.y) * (0.5 + 0.5 * h.x / dens);
            col += ice * body * (0.5 + 0.5 * audioHigh) * (0.6 + 0.4 * float(layer)) * 0.9;
            // Comet tail: points away from the Sun (toward +rho), lit by the
            // onset for bodies whose hash puts them in this onset's family.
            float family = step(0.6, hash21(key + 3.3));
            float tail = exp(-max(d.x, 0.0) * 1.2) * exp(-abs(d.y) * 6.0) * step(0.0, d.x) * (1.0 - smoothstep(0.0, 2.5, d.x));
            col += imgPalette(hue * 0.159 + 0.1) * tail * onset * family * 1.4;
        }
    }

    // Dust haze thickening toward the plane, the Sun at the centre.
    float haze = 0.03 + 0.06 * clamp(audioSwell, 0.0, 1.0);
    col += imgPalette(hue * 0.159 + 0.7) * haze * exp(-abs(p.y) * 3.0);
    float sun = exp(-r * 9.0) * (0.8 + 1.2 * audioLevel) + exp(-r * 2.5) * 0.25;
    col += mix(imgPalette(hue * 0.159 + 0.95), vec3(1.0, 0.9, 0.7), 0.5) * sun;
    col *= 1.0 - 0.35 * smoothstep(0.6, 1.1, r);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
