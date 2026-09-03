#version 330 core
out vec4 fragColor;
/**
 * @file ForaminiferaSpiralShells.frag
 * @brief FORAMINIFERA SPIRAL SHELLS: the chambered shells of forams --
 * single cells that build a spiral of ever larger chambers.  Several
 * shells fill the frame; each grows chamber by chamber over the scene
 * arc (a new chamber inflates smoothly at the aperture), the chambers
 * carry the photo as their calcite wall and are tinted by the chroma
 * class of their index, the pores glint with the treble, and the whole
 * field drifts very slowly as if under a microscope.  Camera still.
 *
 * Audio Reactivity:
 *   sceneProgress    -> chamber growth (the arc)
 *   audioChroma[12]  -> chamber tint by index (light)
 *   audioHigh        -> pore glints (light)
 *   audioSwell       -> microscope light (slow)
 *   audioLevel       -> brightness
 *
 * Per-activation variety: countP, ratioP (chamber growth ratio), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float countP;
uniform float ratioP;
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
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nShells = 3 + int(clamp(countP, 0.0, 1.0) * 3.0);
    float ratio = 1.12 + 0.1 * clamp(ratioP, 0.0, 1.0);
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    vec2 drift = vec2(sceneAdvance * 0.004, sceneAdvance * 0.002);

    // Microscope field: the photo dark and blurred as the slide.
    vec3 col = (interpolation * textureLod(tex0, gl_FragCoord.xy / resolution, 3.0) + (1.0 - interpolation) * textureLod(tex1, gl_FragCoord.xy / resolution, 3.0)).rgb;
    col *= imgPalette(hue * 0.159 + 0.6) * 0.35 * light;
    col *= 0.7 + 0.3 * (1.0 - length(p) * 0.8);

    for (int s = 0; s < 6; ++s)
    {
        if (s >= nShells) break;
        float fs = float(s);
        vec2 c = vec2((hash11(fs * 3.7) - 0.5) * aspect * 0.85, (hash11(fs * 5.3) - 0.5) * 0.85) + drift * (0.5 + hash11(fs * 2.1));
        float scale = 0.02 + 0.015 * hash11(fs * 7.9);
        float twist = hash11(fs * 9.1) * 6.28;
        float sense = (hash11(fs * 11.3) > 0.5) ? 1.0 : -1.0;
        const int N = 22;
        float growth = prog * float(N) * (0.8 + 0.4 * hash11(fs * 4.4));
        // Chambers along a logarithmic spiral; chamber i has centre at
        // angle i*step, radius scale*ratio^i, size proportional; the last
        // chamber inflates with the fractional part of growth.
        for (int i = 0; i < N; ++i)
        {
            float fi = float(i);
            if (fi > growth) break;
            float inflate = clamp(growth - fi, 0.0, 1.0);
            inflate = smoothstep(0.0, 1.0, inflate);
            float ang = twist + sense * fi * 0.55;
            float rad = scale * pow(ratio, fi) * 3.0;
            vec2 cc = c + vec2(cos(ang), sin(ang)) * rad;
            float sz = scale * pow(ratio, fi) * 1.15 * inflate;
            float d = length(p - cc);
            float cham = smoothstep(sz, sz * 0.9, d);
            // Calcite wall: the photo, pale, tinted by the chroma class i mod 12.
            int k = int(mod(fi, 12.0));
            float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
            vec3 wall = mix(img(fract(cc * 0.5 + 0.5)) * 1.3, vec3(0.9, 0.88, 0.8), 0.5);
            wall = mix(wall, wall * imgPalette(hue * 0.159 + float(k) / 12.0) * 1.7, 0.3 + 0.4 * e);
            float shade = 0.55 + 0.6 * sqrt(max(1.0 - d * d / max(sz * sz, 1e-6), 0.0));
            vec3 chamCol = wall * shade * light;
            // Suture line: a dark rim.
            chamCol *= 1.0 - 0.5 * smoothstep(sz * 0.8, sz, d);
            // Pores: round glints on the treble.
            vec2 pu = (p - cc) / max(sz, 1e-4) * 6.0; vec2 pc = floor(pu); vec2 pf = fract(pu) - 0.5;
            float pore = smoothstep(0.25, 0.1, length(pf)) * step(0.7, hash21(pc + fi));
            chamCol += vec3(1.0) * pore * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.5;
            col = mix(col, chamCol, cham);
        }
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
