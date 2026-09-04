#version 330 core
out vec4 fragColor;
/**
 * @file MusicBoxCylinder.frag
 * @brief MUSIC BOX CYLINDER: the works of a cylinder music box, lid open.
 * The pinned brass cylinder turns steadily on the scene clock; the steel
 * comb lies alongside it with one tooth per chroma class, and a tooth
 * lights when its class sounds -- as if the pin passing under it had just
 * plucked it.  The pins are laid out as the score, so the cylinder reads
 * as a rolled piece of music.  The photo is the lid's inlay and the
 * mirror inside it.  Camera fixed over the works.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> which comb teeth ring (light)
 *   sceneAdvance    -> the cylinder turns and the governor spins (continuous)
 *   audioSwell      -> the lamp (slow)
 *   audioKick       -> the bedplate glints (light)
 *   audioHigh       -> the brass sheen (light)
 *
 * Per-activation variety: pinsP, combP, hueP.
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
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float pinsP;
uniform float combP;
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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float pinDensity = 0.1 + 0.16 * clamp(pinsP, 0.0, 1.0);
    float teeth = 12.0 + 12.0 * floor(1.0 + clamp(combP, 0.0, 1.0));     // 12 or 24 teeth
    float lamp = 0.65 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The bedplate: brass with the photo as its engraving, and the lid's
    // mirror behind everything.
    vec3 plate = img(uv * 0.9 + 0.05) * mix(vec3(0.55, 0.42, 0.2), imgPalette(hue * 0.159 + 0.1), 0.3);
    plate *= 0.65 + 0.45 * noise2(p * 26.0);
    plate += vec3(1.0, 0.9, 0.7) * smoothstep(0.5, 0.0, abs(p.y - p.x * 0.4 - 0.3)) * 0.1 * lamp;
    vec3 col = plate * lamp * 0.85;
    // The lid above with its mirror.
    float lid = step(0.3, p.y);
    vec3 mirror = img(vec2(uv.x, 1.0 - uv.y * 0.5)) * 0.7 + 0.06;
    col = mix(col, mirror * lamp * 0.8, lid * 0.85);
    col = mix(col, mix(vec3(0.3, 0.2, 0.1), imgPalette(hue * 0.159 + 0.06), 0.25) * lamp,
              smoothstep(0.008, 0.0, abs(p.y - 0.3)));

    // The cylinder: a horizontal brass drum across the middle.
    float cylY = 0.02, cylR = 0.16;
    vec2 cq = p - vec2(0.0, cylY);
    float onCyl = step(abs(cq.y), cylR) * step(abs(cq.x), 0.42);
    if (onCyl > 0.5)
    {
        // Round the drum: the surface angle from the vertical offset.
        float s = clamp(cq.y / cylR, -1.0, 1.0);
        float ang = asin(s);
        float shade = 0.4 + 0.75 * cos(ang * 0.9);
        vec3 brass = mix(vec3(0.72, 0.55, 0.24), imgPalette(hue * 0.159 + 0.1), 0.25);
        brass *= shade;
        brass += vec3(1.0, 0.95, 0.8) * pow(max(cos(ang - 0.7), 0.0), 14.0) * (0.3 + 0.6 * hi);
        // The rolled score: pins in a lattice of angle and length.  The
        // angle rolls with the clock, so the score passes under the comb.
        float turn = clock * 0.28;
        float a01 = fract(ang / 6.2831853 + turn);
        float along = (cq.x + 0.42) / 0.84;
        vec2 pg = vec2(along * teeth, a01 * 90.0);
        vec2 pc = floor(pg), pf = fract(pg) - 0.5;
        float isPin = step(1.0 - pinDensity, hash21(pc + 3.3));
        float pin = smoothstep(0.3, 0.12, length(pf * vec2(1.0, 0.55))) * isPin;
        // A pin catches the light on its own tip.
        brass += vec3(1.0, 0.92, 0.7) * pin * (0.5 + 0.9 * hi) * shade;
        brass *= 1.0 - 0.25 * smoothstep(0.45, 0.3, length(pf * vec2(1.0, 0.55))) * isPin;
        col = mix(col, brass * lamp, onCyl);
        // The end caps.
        float cap = smoothstep(0.02, 0.0, abs(abs(cq.x) - 0.42));
        col = mix(col, vec3(0.5, 0.4, 0.2) * shade * lamp, cap);
    }
    // The comb: a steel plate below the cylinder with teeth cut into it,
    // one per chroma class (or two combs of twelve).
    float combY = -0.22;
    float onComb = step(abs(p.y - combY), 0.1) * step(abs(p.x), 0.44);
    if (onComb > 0.5)
    {
        float t = (p.x + 0.44) / 0.88 * teeth;
        float ti = floor(t), tf = fract(t);
        int cls = int(mod(ti, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        // The teeth taper: longer teeth are the lower notes.
        float len = 0.16 * (1.0 - 0.5 * ti / teeth);
        float inTooth = step(0.12, tf) * step(tf, 0.88) * step(combY + 0.1 - len, p.y);
        vec3 steel = vec3(0.62, 0.63, 0.66);
        // A ringing tooth lights and takes its class colour.
        vec3 ringCol = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.5 + 0.2;
        steel = mix(steel, ringCol, 0.25 + 0.55 * e);
        steel *= 0.55 + 0.6 * (1.0 + 0.35 * e);
        steel += vec3(1.0) * e * hi * 0.35;
        col = mix(col, steel * lamp, inTooth);
        // The comb's base plate.
        float base = step(p.y, combY + 0.1 - len) * step(combY - 0.1, p.y);
        col = mix(col, vec3(0.4, 0.41, 0.44) * lamp, base * onComb);
        // The glow a ringing tooth throws onto the plate.
        col += ringCol * e * exp(-abs(p.y - (combY + 0.1 - len)) * 22.0) * 0.35;
    }
    // The governor: a small fan spinning fast at the right, steady on the clock.
    vec2 gc = vec2(0.52, -0.05);
    float gr = length(p - gc);
    if (gr < 0.09)
    {
        float ga = atan(p.y - gc.y, p.x - gc.x) - clock * 3.5;
        float blade = smoothstep(0.35, 0.0, abs(fract(ga / 6.2831853 * 3.0) - 0.5) - 0.35) * smoothstep(0.085, 0.02, gr);
        col = mix(col, vec3(0.7, 0.7, 0.74) * lamp * (0.6 + 0.5 * hi), blade * 0.8);
        col = mix(col, vec3(0.5, 0.45, 0.3) * lamp, smoothstep(0.012, 0.008, gr));
    }
    // Screws in the bedplate, and a glint on the kick.
    for (int k = 0; k < 5; ++k)
    {
        float fk = float(k);
        vec2 sc = vec2((hash11(fk * 3.1) - 0.5) * 0.85, -0.4 + 0.05 * hash11(fk * 5.7));
        float d = length(p - sc);
        col = mix(col, vec3(0.5, 0.42, 0.24) * lamp, smoothstep(0.014, 0.01, d));
        col = mix(col, vec3(0.25), smoothstep(0.004, 0.0, abs(dot(p - sc, vec2(0.7, 0.7)))) * smoothstep(0.012, 0.008, d));
        col += vec3(1.0, 0.95, 0.8) * exp(-d * 40.0) * audioKick * 0.6;
    }
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
