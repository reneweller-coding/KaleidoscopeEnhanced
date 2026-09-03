#version 330 core
out vec4 fragColor;
/**
 * @file TuningForkChoir.frag
 * @brief TUNING FORK CHOIR: twelve forks in a row on a sounding board,
 * one per chroma class, each ringing as a standing glow envelope at the
 * energy of its class -- the ring drawn as concentric sound halos (no
 * vibration of the fork itself, which would be a jolt); the kick is the
 * mallet striking the loudest fork (a flash on that fork); the photo is
 * the resonance box front and the halo colour.  Camera fixed in front.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> each fork ring envelope (light)
 *   audioKick       -> the strike on the loudest fork (light)
 *   audioSwell      -> the room light (slow)
 *   sceneAdvance    -> the halos travel outward (continuous)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: sizeP, haloP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sizeP;
uniform float haloP;
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

float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float size = 0.8 + 0.3 * clamp(sizeP, 0.0, 1.0);
    float halo = 0.5 + 0.8 * clamp(haloP, 0.0, 1.0);
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.8 + sceneTime * 0.15;

    // The loudest class (for the mallet).
    int loud = 0; float loudE = -1.0;
    for (int c = 0; c < 12; ++c) if (audioChroma[c] > loudE) { loudE = audioChroma[c]; loud = c; }

    // The room: the photo as a dark wall, a warm light from above.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.3), imgPalette(hue * 0.159 + 0.6) * 0.6, 0.5) * light;
    col *= 0.6 + 0.4 * smoothstep(-0.5, 0.5, p.y);
    // The sounding board: a wooden box across the bottom.
    float board = step(p.y, -0.22);
    vec3 wood = img(vec2(p.x / aspect + 0.5, 0.2 + p.y * 0.3)) * vec3(0.9, 0.65, 0.4) * 1.1 * light;
    wood *= 0.85 + 0.15 * sin(p.x * 60.0 + sin(p.y * 30.0) * 2.0);
    col = mix(col, wood * (0.7 + 0.3 * smoothstep(-0.5, -0.22, p.y)), board);
    col = mix(col, wood * 1.4, smoothstep(0.006, 0.0, abs(p.y + 0.22)));
    // The forks: twelve across, a stem on the board and two tines rising.
    float spacing = aspect * 0.078;
    vec3 glow = vec3(0.0);
    for (int c = 0; c < 12; ++c)
    {
        float fx = (float(c) - 5.5) * spacing;
        // Fork height rises with the class (a lower note = a longer fork).
        float h = (0.42 - float(c) * 0.012) * size;
        vec2 q = p - vec2(fx, -0.22);
        float e = clamp(audioChroma[c] * 1.5, 0.0, 1.0);
        vec3 fc = imgPalette(hue * 0.159 + float(c) / 12.0) * 1.5 + 0.2;
        // Geometry: stem (0 .. 0.12), yoke, tines (0.14 .. h).
        float stem = sdBox(q - vec2(0.0, 0.06), vec2(0.008, 0.06));
        float yoke = length(q - vec2(0.0, 0.135)) - 0.03;
        float tines = min(sdBox(q - vec2(-0.02, 0.14 + (h - 0.14) * 0.5), vec2(0.007, (h - 0.14) * 0.5)), sdBox(q - vec2(0.02, 0.14 + (h - 0.14) * 0.5), vec2(0.007, (h - 0.14) * 0.5)));
        float d = min(stem, min(yoke, tines));
        float metal = smoothstep(0.003, 0.0, d);
        // Steel shading: a highlight along the left side of each tine.
        float shade = 0.55 + 0.45 * cos((q.x - floor(q.x / 0.04 + 0.5) * 0.04) * 120.0);
        vec3 steel = vec3(0.8, 0.82, 0.88) * shade * light;
        steel += fc * e * 0.6;                                         // the ringing fork takes its colour
        if (c == loud) steel += vec3(1.0, 0.95, 0.85) * audioKick * 1.5;
        col = mix(col, steel, metal);
        // The ring halo: concentric rings expanding from the tine tips on the clock, amplitude by the class energy.
        vec2 tip = vec2(0.0, h * 0.85);
        float r = length((q - tip) * vec2(1.0, 0.7));
        float rings = pow(0.5 + 0.5 * cos(r * 60.0 - clock * 6.0), 3.0);
        float env = exp(-r * (3.0 / halo)) * e;
        glow += fc * rings * env * 0.9;
        glow += fc * exp(-r * 8.0) * e * 0.4;
        // The strike flash on the loudest fork.
        if (c == loud) glow += fc * exp(-r * 5.0) * audioKick * 1.2;
        // Reflection on the board.
        float refl = smoothstep(0.04, 0.0, abs(q.x)) * step(q.y, 0.0) * exp(q.y * 6.0);
        col += fc * refl * e * 0.35 * board;
    }
    col += glow;
    // The mallet: a small round head hovering over the forks; its position
    // is the chroma-weighted centre of the row, so it glides between forks.
    float cx = 0.0, cw = 0.0;
    for (int c = 0; c < 12; ++c) { float w = pow(clamp(audioChroma[c], 0.0, 1.0), 4.0) + 0.001; cx += (float(c) - 5.5) * spacing * w; cw += w; }
    cx /= cw;
    vec2 mq = p - vec2(cx, 0.32 * size + 0.02);
    float head = smoothstep(0.03, 0.026, length(mq));
    float handle = smoothstep(0.008, 0.005, abs(mq.x)) * step(0.0, mq.y) * step(mq.y, 0.3);
    col = mix(col, vec3(0.3, 0.2, 0.12) * light, max(head, handle * 0.8));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
