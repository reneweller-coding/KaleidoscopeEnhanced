#version 330 core
out vec4 fragColor;
/**
 * @file SalarMirrorFlats.frag
 * @brief SALAR MIRROR FLATS: the salt flat after rain -- a few centimetres
 * of water over the crust make the largest mirror on Earth.  The sky is
 * the photo; the flat mirrors it exactly, so the horizon vanishes; under
 * the water the hexagonal salt crust shows through; walkers stand as
 * round-headed silhouettes on the clock, mirrored too.  The cloud light is
 * the swell, the treble is the glitter of ripples, the kick a far flash.
 * Camera fixed at eye height.
 *
 * Audio Reactivity:
 *   audioSwell   -> cloud light (slow)
 *   sceneAdvance -> walkers and ripples (continuous)
 *   audioHigh    -> ripple glitter (light)
 *   audioKick    -> far lightning (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: crustP, walkersP, hueP.
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
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float crustP;
uniform float walkersP;
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

// Hexagonal crust: distance to the nearest cell edge (pointy-top hex).
float hexEdge(vec2 p, float s)
{
    vec2 r = vec2(1.7320508, 3.0) * s;
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = (dot(a, a) < dot(b, b)) ? a : b;
    vec2 ag = abs(gv);
    return max(ag.x, dot(ag, vec2(0.5, 0.8660254))) / (0.8660254 * s);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float crust = 0.4 + 0.6 * clamp(crustP, 0.0, 1.0);
    int nWalk = 2 + int(clamp(walkersP, 0.0, 1.0) * 4.0);
    float light = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.2 + sceneTime * 0.04;
    float horizon = 0.0;

    // Sky: the photo, warm-lit; the mirror below is the same photo flipped.
    vec2 skyUV = vec2(p.x / aspect + 0.5, abs(p.y - horizon) * 1.6 + 0.05);
    vec3 sky = img(clamp(skyUV, 0.0, 1.0)) * mix(vec3(1.0), imgPalette(hue * 0.159 + 0.6) * 1.5, 0.25) * light;
    sky += vec3(1.0, 0.95, 0.85) * exp(-abs(p.y - horizon) * 6.0) * 0.25 * light;    // the bright band at the horizon
    sky += vec3(1.0) * audioKick * 0.4 * exp(-length(p - vec2(0.6, 0.15)) * 3.0);     // far lightning
    vec3 col = sky;
    if (p.y < horizon)
    {
        // The mirror: the sky flipped, slightly darker, with the crust showing
        // through in perspective and glitter on the ripples.
        float d = horizon - p.y;                                     // distance down the screen
        float persp = 1.0 / max(d * 8.0, 0.4);                       // ground perspective
        vec2 gp = vec2(p.x * persp * 3.0, persp * 1.0 + clock * 0.02);
        float edge = hexEdge(gp, 0.5);
        float crustLine = smoothstep(0.86, 0.98, edge) * smoothstep(0.02, 0.2, d) * crust;
        vec3 mirror = sky * 0.85;
        mirror = mix(mirror, vec3(0.95, 0.95, 0.9) * light, crustLine * 0.18 * smoothstep(0.5, 0.05, d));
        float ripple = pow(0.5 + 0.5 * sin(p.x * 80.0 + d * 200.0 + clock * 6.0), 8.0) * smoothstep(0.0, 0.15, d);
        mirror += vec3(1.0) * ripple * (0.05 + 0.18 * clamp(audioHigh * 2.0, 0.0, 1.0)) * light;
        col = mirror;
    }
    // Walkers: silhouettes (a round head on a body) far out on the flat,
    // moving slowly on the clock; each mirrored below the horizon.
    for (int i = 0; i < 6; ++i)
    {
        if (i >= nWalk) break;
        float fi = float(i);
        float x = (fract(clock * (0.03 + 0.02 * hash11(fi * 3.1)) + hash11(fi * 5.3)) - 0.5) * aspect * 1.4;
        float dist = 0.3 + 0.6 * hash11(fi * 7.7);                     // 0 near .. 1 far
        float h = 0.16 * (1.0 - dist * 0.85);
        float footY = horizon - 0.02 * (1.0 - dist);
        vec2 q = p - vec2(x, footY);
        float body = step(abs(q.x), h * 0.18) * step(0.0, q.y) * step(q.y, h * 0.75);
        float head = smoothstep(h * 0.14, h * 0.1, length(q - vec2(0.0, h * 0.85)));
        float fig = max(body, head);
        vec2 qm = p - vec2(x, footY);
        qm.y = -qm.y;
        float bodyM = step(abs(qm.x), h * 0.18) * step(0.0, qm.y) * step(qm.y, h * 0.75);
        float headM = smoothstep(h * 0.14, h * 0.1, length(qm - vec2(0.0, h * 0.85)));
        float figM = max(bodyM, headM) * 0.7;
        col = mix(col, vec3(0.05, 0.05, 0.07), max(fig, figM));
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
