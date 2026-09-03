#version 330 core
out vec4 fragColor;
/**
 * @file StippleVoronoiRelax.frag
 * @brief STIPPLE VORONOI RELAX: weighted Voronoi stippling of the photo --
 * the dots are denser and larger where the picture is dark, as in a
 * pen-and-ink stipple, and they relax on the scene clock (each dot drifts
 * on a small smooth orbit as if Lloyd's iteration were still settling).
 * The swell tightens the pattern (finer dots), the kick lights the dots
 * on the darkest tones, the treble the lightest.  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance -> relaxation drift (continuous)
 *   audioSwell   -> dot density (slow)
 *   audioKick    -> dark-tone dots flash (light)
 *   audioHigh    -> light-tone dots flash (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: densP, inkP (ink colour blend), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float densP;
uniform float inkP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float base = 40.0 + 30.0 * clamp(densP, 0.0, 1.0);
    float dens = base * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float inkMix = clamp(inkP, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;

    // Paper: warm white with the photo very faint.
    vec3 paper = vec3(0.94, 0.91, 0.84);
    paper = mix(paper, paper * imgPalette(hue * 0.159 + 0.1) * 1.3, 0.1);
    vec3 col = paper;
    vec3 ink = mix(vec3(0.08, 0.06, 0.05), imgPalette(hue * 0.159 + 0.6) * 0.5, inkMix * 0.6);

    // Three dot layers of increasing density; a dot exists where the local
    // darkness exceeds the layer's threshold (so dark = more dots), sized
    // by the darkness, jittered, and drifting on small orbits (relaxation).
    float dark = 1.0 - dot(img(uv), vec3(0.299, 0.587, 0.114));
    dark = smoothstep(0.05, 0.95, dark);
    float kickLit = audioKick * smoothstep(0.6, 0.9, dark);
    float hiLit = clamp(audioHigh * 2.0, 0.0, 1.0) * smoothstep(0.4, 0.1, dark);
    for (int layer = 0; layer < 3; ++layer)
    {
        float fl = float(layer);
        float sc = dens * (1.0 + 0.7 * fl);
        vec2 gu = p * sc + fl * 13.0;
        vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
        vec2 jit = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        vec2 orbit = 0.12 * vec2(sin(clock * (0.7 + hash21(cell + 2.2)) + hash21(cell) * 6.28), cos(clock * (0.6 + hash21(cell + 4.4)) + hash21(cell + 1.0) * 6.28));
        vec2 centre = (cell + 0.5 + jit * 0.6 + orbit) / sc;
        vec2 cuv = centre * vec2(1.0 / aspect, 1.0) + 0.5;
        float cdark = 1.0 - dot(img(clamp(cuv, 0.0, 1.0)), vec3(0.299, 0.587, 0.114));
        cdark = smoothstep(0.05, 0.95, cdark);
        float threshold = 0.15 + 0.3 * fl;
        float present = smoothstep(threshold - 0.05, threshold + 0.05, cdark);
        float r = (0.16 + 0.26 * cdark) * (1.0 - 0.15 * fl);
        float d = length(f + 0.0 - (jit * 0.6 + orbit));
        float dot_ = smoothstep(r, r * 0.6, d) * present;
        vec3 dotCol = ink;
        dotCol = mix(dotCol, imgPalette(hue * 0.159 + 0.9) * 1.5, kickLit * 0.3);
        dotCol = mix(dotCol, vec3(1.0, 0.95, 0.8), hiLit * 0.25);
        col = mix(col, dotCol, dot_);
    }
    // Paper grain (static) and vignette.
    col *= 0.96 + 0.04 * hash21(floor(gl_FragCoord.xy * 0.5));
    col *= 0.9 + 0.1 * (1.0 - length(p) * 0.6);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
