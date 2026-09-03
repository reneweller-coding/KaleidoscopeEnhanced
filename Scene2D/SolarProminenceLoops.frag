#version 330 core
out vec4 fragColor;
/**
 * @file SolarProminenceLoops.frag
 * @brief SOLAR PROMINENCE LOOPS: the camera stands on the Sun.  Below, the
 * granulated photosphere boils; above, magnetic loops arch from footpoint
 * to footpoint, each a glowing tube of plasma streaming along the field on
 * the music's pace.  Builds raise the loops (slowly, on the swell); the
 * bass is the plasma's brightness; a drop lights the biggest loop end to
 * end as if it had just reconnected -- light, never a jolt.  The camera
 * never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance -> plasma streams along the loops (continuous)
 *   audioSwell   -> loop height (slow)
 *   audioBass    -> plasma brightness (light)
 *   audioDrop    -> reconnection flash on the main loop (light)
 *   audioKick    -> footpoint flares (light)
 *   audioLevel   -> photosphere brightness
 *
 * Per-activation variety: loopsP (loop count 4..8), heightP, hueP.
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
uniform float audioBass;
uniform float audioDrop;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float loopsP;
uniform float heightP;
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
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float nLoops = floor((loopsP > 1.5 ? loopsP : 6.0) + 0.5);
    float hgt = 0.6 + 0.5 * clamp(heightP, 0.0, 1.0);
    float lift = 1.0 + 0.35 * clamp(audioSwell, 0.0, 1.0);

    vec3 hot  = imgPalette(hue * 0.159 + 0.05) * 1.6 + vec3(0.5, 0.2, 0.0);
    vec3 warm = imgPalette(hue * 0.159 + 0.15);
    vec3 cool = imgPalette(hue * 0.159 + 0.6);

    // The photosphere: the lower third, boiling granules drifting on the
    // scene clock, brighter on the level.
    const float horizon = -0.32;
    vec3 col = vec3(0.0);
    if (p.y < horizon)
    {
        vec2 g = vec2(p.x * 3.0, (p.y - horizon) * 9.0) + vec2(sceneAdvance * 0.05, 0.0);
        float gran = fbm(g * 2.0 + vec2(0.0, sceneTime * 0.05));
        float cells = pow(0.5 + 0.5 * sin(gran * 12.0), 3.0);
        col = mix(warm * 0.6, hot, cells) * (0.5 + 0.5 * audioLevel);
        col *= 1.0 - 0.5 * smoothstep(horizon - 0.02, horizon - 0.35, p.y);   // fades down
    }
    else
    {
        // Corona: dark, a faint glow above the limb, streamers.
        float above = p.y - horizon;
        col = cool * 0.04 * exp(-above * 3.0) + hot * 0.08 * exp(-above * 12.0);
        col += cool * 0.03 * fbm(vec2(p.x * 2.0, above * 1.5) + sceneAdvance * 0.02);
    }

    // Magnetic loops: semi-ellipses from footpoint to footpoint, each a tube
    // with plasma flowing along it.
    float drop = clamp(audioDrop, 0.0, 1.0);
    for (int i = 0; i < 8; ++i)
    {
        if (float(i) >= nLoops) break;
        float fi = float(i);
        float cx = (hash11(fi * 3.1) - 0.5) * 1.6;
        float w  = 0.12 + 0.28 * hash11(fi * 5.3);
        float h  = (0.15 + hgt * hash11(fi * 7.7)) * lift * (i == 0 ? 1.4 : 1.0);
        // Ellipse through the footpoints (cx +- w, horizon) with height h.
        vec2 q = vec2((p.x - cx) / w, (p.y - horizon) / h);
        float rr = length(q);
        float d = abs(rr - 1.0) * min(w, h);                 // approx. distance to the arc
        if (p.y < horizon) d += (horizon - p.y) * 2.0;        // below the surface: none
        float tube = exp(-d * d * 900.0);
        float halo = exp(-d * 25.0) * 0.35;
        // Plasma streams along the arc: a phase on the arc angle.
        float ang = atan(q.y, max(q.x, -10.0));
        float flow = 0.5 + 0.5 * sin(ang * 9.0 - sceneAdvance * (2.5 + fi * 0.3) - sceneTime * 0.6);
        flow = pow(flow, 2.0);
        float bright = 0.35 + 0.8 * clamp(audioBass, 0.0, 1.0);
        float recon = (i == 0) ? drop * 1.5 : 0.0;          // the main loop reconnects on the drop
        vec3 lc = mix(warm, hot, 0.4 + 0.6 * flow);
        col += lc * (tube * (bright * (0.5 + 0.5 * flow) + recon) + halo * (0.5 + 0.5 * bright + recon));
        // Footpoints flare on the kick.
        float fp = exp(-dot(p - vec2(cx - w, horizon), p - vec2(cx - w, horizon)) * 400.0)
                 + exp(-dot(p - vec2(cx + w, horizon), p - vec2(cx + w, horizon)) * 400.0);
        col += hot * fp * (0.4 + 1.2 * audioKick);
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
