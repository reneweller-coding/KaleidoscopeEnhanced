#version 330 core
out vec4 fragColor;
/**
 * @file GlasshouseIronRibs.frag
 * @brief GLASSHOUSE IRON RIBS: inside a Victorian palm house, looking up
 * along the barrel vault.  Iron ribs and glazing bars converge toward the
 * ridge, the panes carry the sky and the garden beyond (the photo),
 * condensation drops slide down the glass on the scene clock, and the sun
 * crosses the vault over the scene arc so the whole cast pattern travels.
 * The bass is the warm haze under the roof.  Camera fixed, looking up.
 *
 * Audio Reactivity:
 *   sceneProgress -> the sun crosses the vault (the arc)
 *   sceneAdvance  -> condensation drops slide, haze drifts (continuous)
 *   audioSwell    -> daylight (slow)
 *   audioBass     -> warm haze under the glass (slow)
 *   audioHigh     -> glints on the wet glass (light)
 *
 * Per-activation variety: ribsP, dropP, hueP.
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
uniform float audioSwell;
uniform float audioBass;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ribsP;
uniform float dropP;
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
    float ribs = 7.0 + floor(clamp(ribsP, 0.0, 1.0) * 7.0);             // once per activation
    float drops = 0.4 + 0.9 * clamp(dropP, 0.0, 1.0);
    float day = 0.55 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float prog = clamp(sceneProgress, 0.0, 1.0);

    // Looking up a barrel vault: the ridge runs across the top of frame and
    // the ribs fan out toward the viewer.  A ridge coordinate (u along the
    // vault, v across it) makes the whole roof one simple mapping.
    float v = p.x / (0.35 + 0.85 * max(p.y + 0.55, 0.05));               // across the vault
    float u = 1.0 / max(p.y + 0.55, 0.05);                               // along it, perspective
    // The sun crosses the vault over the arc.
    float sunV = mix(-0.9, 0.9, prog);
    vec2 sunP = vec2(sunV * (0.35 + 0.85 * 0.55), 0.28);
    vec3 sunCol = mix(vec3(1.0, 0.96, 0.85), imgPalette(hue * 0.159 + 0.1), 0.25);

    // Panes: the sky and the garden through the glass, brighter toward the
    // ridge, with a green cast from the plants below reflected in them.
    vec2 paneUV = clamp(vec2(v * 0.4 + 0.5, 0.25 + 0.5 / max(u, 0.6)), 0.0, 1.0);
    vec3 outside = img(paneUV) * mix(vec3(0.85, 0.95, 1.0), imgPalette(hue * 0.159 + 0.55), 0.3);
    vec3 col = outside * (0.5 + 0.75 * day);
    // The glass is dirty and slightly green.
    col *= 0.85 + 0.25 * noise2(vec2(v * 6.0, u * 2.0));
    col = mix(col, col * vec3(0.9, 1.0, 0.92), 0.4);
    // The glazing grid: ribs across the vault, purlins along it.
    float ribI = v * ribs;
    float ribD = abs(fract(ribI) - 0.5);
    float ribW = 0.055 + 0.03 / max(u, 1.0);
    float rib = smoothstep(ribW, ribW * 0.55, ribD);
    float purl = smoothstep(0.05, 0.02, abs(fract(u * 1.6) - 0.5) - 0.44);
    vec3 iron = mix(vec3(0.16, 0.17, 0.16), imgPalette(hue * 0.159 + 0.3) * 0.25, 0.35);
    // Ironwork catches the light on its upper edge.
    float ironLit = smoothstep(ribW * 0.9, ribW * 0.2, abs(ribD - ribW * 0.5));
    col = mix(col, iron * (0.5 + 0.5 * day) + sunCol * ironLit * 0.25 * day, clamp(rib + purl * 0.8, 0.0, 1.0));
    // Ridge beam and the finial cresting along the very top.
    float ridge = smoothstep(0.05, 0.02, abs(p.y - 0.44));
    float crest = smoothstep(0.012, 0.0, abs(fract(p.x * 22.0) - 0.5) - 0.42) * step(0.44, p.y) * step(p.y, 0.49);
    col = mix(col, iron * (0.6 + 0.4 * day), clamp(ridge + crest, 0.0, 1.0));
    // The sun through the glass: a bright patch with a bloom, and the
    // shadow pattern of the ribs cast down into the haze.
    float dSun = length(p - sunP);
    col += sunCol * exp(-dSun * 5.5) * day * 0.7;
    col += sunCol * exp(-dSun * 22.0) * day * 1.1;
    // Warm haze under the roof, thicker with the bass, lit by the sun.
    float haze = (0.25 + 0.55 * clamp(audioBass, 0.0, 1.0)) * smoothstep(0.5, -0.4, p.y);
    float hazeN = 0.6 + 0.5 * noise2(p * 2.4 + vec2(clock * 0.1, clock * 0.03));
    col += sunCol * haze * hazeN * exp(-dSun * 1.8) * 0.5 * day;
    // Condensation: drops on the inside of the glass, sliding down slowly
    // on the clock, each dragging a thin wet trail.
    for (int layer = 0; layer < 2; ++layer)
    {
        float fl = float(layer);
        float scale = 9.0 + fl * 7.0;
        vec2 g = vec2(p.x, p.y + clock * (0.02 + 0.012 * fl)) * scale + fl * 11.0;
        vec2 c = floor(g);
        vec2 f = fract(g) - 0.5;
        float h = hash21(c + fl * 5.3);
        if (h > 1.0 - 0.22 * drops)
        {
            vec2 jit = vec2(hash21(c + 1.7), hash21(c + 9.1)) - 0.5;
            vec2 q = f - jit * 0.6;
            float r = length(q * vec2(1.0, 1.25));
            float drop = smoothstep(0.16, 0.05, r);
            // The drop is a little lens: it brightens and shifts the view.
            col = mix(col, img(clamp(paneUV + q * 0.05, 0.0, 1.0)) * 1.3 * day, drop * 0.7);
            col += vec3(1.0, 0.98, 0.95) * smoothstep(0.06, 0.0, length(q - vec2(-0.03, 0.03))) * drop * (0.4 + 0.9 * hi);
            // Trail above it, where it has already run.
            float trail = smoothstep(0.05, 0.0, abs(q.x)) * smoothstep(0.0, 0.35, q.y) * smoothstep(0.5, 0.2, q.y);
            col += vec3(0.7, 0.8, 0.85) * trail * 0.12 * day;
        }
    }
    // Palm fronds at the lower edge, dark against the light.
    float frond = 0.0;
    for (int i = 0; i < 5; ++i)
    {
        float fi = float(i);
        vec2 base = vec2((hash11(fi * 3.1) - 0.5) * aspect * 1.5, -0.55);
        vec2 d = p - base;
        float ang = atan(d.y, d.x);
        float len = length(d);
        float leaf = smoothstep(0.35, 0.0, abs(ang - (0.7 + 0.9 * hash11(fi * 5.7)))) * smoothstep(0.55, 0.1, len);
        leaf *= 0.5 + 0.5 * pow(abs(sin(len * 34.0 + fi)), 0.6);
        frond = max(frond, leaf);
    }
    col = mix(col, mix(vec3(0.05, 0.09, 0.05), imgPalette(hue * 0.159 + 0.35) * 0.2, 0.4), frond * 0.9);
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
