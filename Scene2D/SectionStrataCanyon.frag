#version 330 core
out vec4 fragColor;
/**
 * @file SectionStrataCanyon.frag
 * @brief SECTION STRATA CANYON: the song as geology, in a canyon at golden
 * hour.  Across the gorge rises a wall of banded rock -- deep red, orange,
 * cream, maroon, the colours of a desert canyon -- carved into mesas and
 * side canyons, its ledges catching the low sun; a river glints far below
 * and a shaded near cliff frames the view.  The bands at the top of the
 * wall are the song: every section that has played is a stratum there, the
 * current one being laid down on top and growing with its age, so the rim
 * rises as the song goes on.  The erosion drifts slowly past on the scene
 * clock; the bass lights the seams, the kick drops grains from the rim.
 *
 * Audio Reactivity:
 *   audioSectionId / Count / Age -> the song strata on the rim (structure)
 *   sceneAdvance    -> erosion drift, river glints (continuous)
 *   audioBass       -> seam light (light)
 *   audioKick       -> grains falling from the rim (light)
 *   audioSwell      -> the sun on the wall (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: layerP (stratum thickness), erosionP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSectionId;
uniform float audioSectionCount;
uniform float audioSectionAge;
uniform float audioBass;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float layerP;
uniform float erosionP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 5.0; a *= 0.5; }
    return v;
}

// The canyon's own rock colours.
vec3 rockColour(float k)
{
    int i = int(mod(k, 6.0));
    if (i == 0) return vec3(0.62, 0.24, 0.13);    // deep red
    if (i == 1) return vec3(0.86, 0.5, 0.26);     // orange
    if (i == 2) return vec3(0.92, 0.8, 0.62);     // cream
    if (i == 3) return vec3(0.52, 0.23, 0.17);    // maroon
    if (i == 4) return vec3(0.78, 0.6, 0.4);      // tan
    return vec3(0.55, 0.52, 0.42);                // grey-green shale
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float sun = 0.75 + 0.45 * swell;
    float erosion = 0.5 + 0.8 * clamp(erosionP, 0.0, 1.0);
    float clock = sceneAdvance * 0.02 + sceneTime * 0.004;

    // The song strata sit on an ancient base; the current section grows.
    float songH = 0.018 + 0.014 * clamp(layerP, 0.0, 1.0);
    float count = clamp(audioSectionCount, 0.0, 12.0);
    float curGrow = clamp(audioSectionAge / 40.0, 0.0, 1.0);
    float baseTop = 0.08;                                  // top of the ancient rock
    float stackTop = baseTop + (count + curGrow) * songH;

    // Sky: low golden sun on the right, blue above, a few lit clouds.
    vec3 col = mix(vec3(1.0, 0.72, 0.45), vec3(0.3, 0.5, 0.85), smoothstep(0.05, 0.5, p.y));
    col += vec3(1.0, 0.85, 0.6) * exp(-length(p - vec2(0.95, 0.18)) * 3.0) * 0.5 * sun;
    col = mix(col, vec3(1.0, 0.85, 0.75), smoothstep(0.6, 0.85, fbm(vec2(p.x * 2.0 + clock, p.y * 8.0))) * 0.4);
    col = mix(col, col * imgPalette(0.55 + hue * 0.159) * 1.4, 0.1);

    // The far wall: its rim profile has mesas and side-canyon notches.
    float xr = p.x * 1.4 + clock;
    float mesa = floor(noise2(vec2(xr * 1.5, 3.0)) * 3.0) / 3.0;           // stepped tops
    // Side canyons cut down in steps (each hard bed makes a step).
    float notchN = smoothstep(0.55, 0.85, noise2(vec2(xr * 2.2, 7.0)));
    float notch = floor(notchN * 5.0 + 0.5 * fbm(vec2(xr * 20.0, 3.0))) / 5.0 * 0.26 * erosion;
    float rim = stackTop - 0.05 + 0.08 * mesa * erosion - notch + 0.012 * (fbm(vec2(xr * 12.0, 1.0)) - 0.5);
    rim = mix(rim, stackTop, 0.0);
    float floorY = -0.42;
    if (p.y < rim && p.y > floorY) {
        // Height in the wall, with slightly wavy bedding.
        float y = p.y + 0.02 * (fbm(vec2(xr * 2.0, p.y * 1.5)) - 0.5);
        vec3 rock;
        float within, seamD;
        if (y < baseTop) {
            // Ancient strata: thick, alternating cliff and slope.
            float lh = 0.05;
            float lf = (y - floorY) / lh;
            lf += 0.35 * sin(floor(lf) * 2.7);                       // uneven bed thickness
            float li = floor(lf);
            within = fract(lf);
            rock = rockColour(li * 5.0 + 1.0);
            seamD = min(within, 1.0 - within) * lh;
        } else {
            // Song strata: one per section, the top one still growing.
            float lf = (y - baseTop) / songH;
            float li = floor(lf);
            within = fract(lf);
            float secId = (li >= count) ? audioSectionId : li;
            rock = mix(rockColour(secId * 3.0 + 2.0), imgPalette(fract(secId * 0.23) + hue * 0.159) * 1.2, 0.3);
            seamD = min(within, 1.0 - within) * songH;
        }
        // Cliff bands (hard rock, vertical, lit) and talus slopes (soft,
        // broken, shaded) alternate with each bed.
        float hard = smoothstep(0.3, 0.4, within);
        // Gullies and buttresses: vertical relief on the cliff faces.
        float gully = fbm(vec2(xr * 18.0, y * 1.5));
        float face = hard * (0.6 + 0.6 * gully)
                   + (1.0 - hard) * (0.45 + 0.35 * fbm(vec2(xr * 40.0, y * 60.0)));
        // Low sun from the right: faces turned right are lit, notches shade.
        float light = 0.55 + 0.45 * smoothstep(-0.2, 0.3, sin(xr * 5.0 + fbm(vec2(xr * 3.0, 2.0)) * 4.0));
        light *= 1.0 - 0.5 * smoothstep(0.02, 0.12, rim - p.y) * smoothstep(0.4, 0.8, noise2(vec2(xr * 2.2, 7.0)));
        rock *= face * light * sun;
        // Ledge tops catch the sun; the seams glow with the bass.
        rock += vec3(1.0, 0.8, 0.5) * smoothstep(0.004, 0.0, abs(within - 0.98) * 0.05) * 0.1 * sun;
        rock += rock * smoothstep(0.004, 0.0, seamD) * (0.2 + 1.2 * clamp(audioBass, 0.0, 1.0));
        // The fresh top of the growing layer.
        rock += vec3(1.0, 0.85, 0.6) * smoothstep(0.01, 0.0, stackTop - p.y) * 0.3 * step(baseTop, y);
        // Haze across the gorge.
        rock = mix(rock, vec3(0.95, 0.75, 0.6), 0.18);
        col = mix(col, rock, smoothstep(0.0, 0.003, rim - p.y));
        // The rim line in full sun.
        col += vec3(1.0, 0.85, 0.6) * exp(-(rim - p.y) * 250.0) * 0.4 * sun;
    }
    // The river far below: a green-blue ribbon reflecting the sky, glints.
    if (p.y <= floorY) {
        float bank = floorY - 0.03 - 0.02 * sin(p.x * 3.0 + 1.0);
        vec3 ground = vec3(0.5, 0.3, 0.2) * (0.6 + 0.3 * fbm(p * 30.0)) * sun;
        vec3 river = mix(vec3(0.15, 0.4, 0.4), vec3(0.8, 0.7, 0.55), 0.3);
        float gl = pow(noise2(vec2(p.x * 25.0 + sceneAdvance * 0.3, p.y * 140.0)), 18.0);
        river += vec3(1.0, 0.9, 0.7) * gl * 1.5 * sun;
        col = (p.y < bank) ? river : ground;
    }
    // The near cliff on the left, in shade, with its own strata.
    float nearEdge = -0.74 + 0.1 * fbm(vec2(p.y * 5.0, 5.0)) - 0.08 * smoothstep(0.0, 0.5, p.y) + 0.03 * floor(fbm(vec2(p.y * 3.0, 9.0)) * 4.0);
    if (p.x < nearEdge) {
        float lf = (p.y + 0.5) / 0.09;
        vec3 nr = rockColour(floor(lf) * 5.0 + 3.0) * (0.14 + 0.12 * fbm(vec2(p.x * 30.0, p.y * 6.0)));
        nr = mix(nr, vec3(0.1, 0.07, 0.07) * (0.7 + 0.6 * fbm(vec2(p.x * 20.0, p.y * 20.0))), 0.6);
        nr = mix(nr, vec3(0.12, 0.14, 0.22), 0.3);                     // blue shade
        nr += vec3(1.0, 0.7, 0.45) * exp(-(nearEdge - p.x) * 120.0) * 0.4 * sun;   // rim light
        col = nr;
    }
    // Grains falling from the rim on the kick: round, on the clock.
    vec2 gu = (p + vec2(0.0, sceneAdvance * 0.3)) * 50.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float grains = smoothstep(0.2, 0.06, length(gf - go * 0.6)) * step(0.97, hash21(gc)) * step(p.y, rim) * step(floorY, p.y) * clamp(audioKick, 0.0, 1.0);
    col += vec3(1.0, 0.85, 0.6) * grains * 0.6;
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
