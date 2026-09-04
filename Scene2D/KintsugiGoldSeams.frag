#version 330 core
out vec4 fragColor;
/**
 * @file KintsugiGoldSeams.frag
 * @brief KINTSUGI GOLD SEAMS: a bowl that was broken and mended with gold.
 * The crack network is a Voronoi seam field over the bowl; over the scene
 * arc the breaks spread outward from the first fracture and the gold
 * flows into them behind the spreading front, so the piece is whole, then
 * broken, then mended -- one continuous sweep with no cut.  The glaze is
 * the photo; the treble is the gold catching the light, the kick a glint
 * running along one seam.  Camera fixed above the bowl.
 *
 * Audio Reactivity:
 *   sceneProgress -> the break spreads and the gold follows (the arc)
 *   audioHigh     -> the gold's sheen (light)
 *   audioKick     -> a glint travelling one seam (light)
 *   audioSwell    -> the room light on the glaze (slow)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: shardsP, goldP, hueP.
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
uniform float audioHigh;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float shardsP;
uniform float goldP;
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
vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 3.1; a *= 0.5; } return v; }

// Voronoi seam distance and the id of the nearer cell.
void voronoi(vec2 x, out float seam, out float id, out vec2 centre)
{
    vec2 n = floor(x), f = fract(x);
    float d1 = 8.0, d2 = 8.0; id = 0.0; centre = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 g = vec2(float(i), float(j));
        vec2 h = hash22(n + g);
        vec2 r = g + h - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h.x; centre = n + g + h; }
        else if (d < d2) { d2 = d; }
    }
    seam = sqrt(d2) - sqrt(d1);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float shards = 3.5 + 3.5 * clamp(shardsP, 0.0, 1.0);
    float goldW = 0.5 + 0.8 * clamp(goldP, 0.0, 1.0);
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The table under the bowl.
    vec3 table = img(uv * 0.8 + 0.1) * mix(vec3(0.2, 0.16, 0.12), imgPalette(hue * 0.159 + 0.08) * 0.3, 0.4);
    table *= 0.6 + 0.4 * fbm(p * 9.0);
    vec3 col = table * light * 0.7;

    // The bowl: a disc with a rim, seen from above and slightly tilted.
    vec2 q = p * vec2(1.0, 1.12);
    float r = length(q);
    float bowlR = 0.4;
    float inBowl = smoothstep(bowlR, bowlR - 0.006, r);
    if (inBowl > 0.002)
    {
        // The glaze: the photo, soft, with a wheel-thrown ring texture.
        vec3 glaze = img(clamp(q * 1.1 + 0.5, 0.0, 1.0)) * mix(vec3(0.75, 0.78, 0.8), imgPalette(hue * 0.159 + 0.5), 0.3);
        glaze *= 0.72 + 0.35 * sin(r * 90.0);
        glaze *= 0.8 + 0.35 * fbm(q * 20.0);
        // Curvature shading: the bowl dips away from the light.
        float dome = sqrt(max(1.0 - (r / bowlR) * (r / bowlR), 0.0));
        glaze *= 0.5 + 0.75 * dome;
        // Rim highlight.
        glaze += vec3(1.0, 0.98, 0.95) * smoothstep(0.02, 0.0, abs(r - bowlR + 0.012)) * 0.5;
        vec3 bowl = glaze * light;

        // The crack network.  The break starts at one point and spreads;
        // a seam exists once the front has passed its own position.
        vec2 origin = vec2(-0.13, 0.1);
        float seam, id; vec2 centre;
        voronoi(q * shards + 3.7, seam, id, centre);
        float fromOrigin = length((centre / shards) - origin);
        // The front: it sweeps outward over the first half of the arc.
        float front = smoothstep(0.0, 0.55, prog) * 0.9;
        float broken = smoothstep(front + 0.06, front - 0.06, fromOrigin);
        // The gold follows the break, a little behind it.
        float goldFront = smoothstep(0.12, 0.75, prog) * 0.95;
        float mended = smoothstep(goldFront + 0.06, goldFront - 0.06, fromOrigin);
        // The seam itself: a dark line, widened where the gold has arrived.
        float w = 0.024 * goldW;
        float crack = smoothstep(w * 1.6, w * 0.5, seam) * broken;
        float gold = smoothstep(w * 1.35, w * 0.35, seam) * mended;
        // A wandering edge, so the break is not a clean Voronoi line.
        float edgeNoise = (fbm(q * 26.0) - 0.5) * w * 1.2;
        crack = smoothstep(w * 1.6, w * 0.5, seam + edgeNoise) * broken;
        gold = smoothstep(w * 1.35, w * 0.35, seam + edgeNoise) * mended;
        // Dark crack, then the gold laid into it.
        bowl = mix(bowl, bowl * 0.25, crack);
        vec3 goldCol = mix(vec3(1.0, 0.78, 0.3), imgPalette(hue * 0.159 + 0.12), 0.3);
        // The gold is not flat: it has a bright core and a warm edge.
        float core = smoothstep(w * 0.85, w * 0.15, seam + edgeNoise) * mended;
        bowl = mix(bowl, goldCol * (1.1 + 0.6 * light), gold);
        bowl += goldCol * core * (0.8 + 1.4 * hi) * 1.3;
        // A glint travelling along the seams on the kick: a bright band
        // that sweeps by angle, so it runs round the bowl.
        float a = atan(q.y, q.x);
        float sweep = pow(0.5 + 0.5 * cos(a - clock * 1.6), 22.0);
        bowl += goldCol * gold * sweep * (0.3 + 1.6 * audioKick);
        // Each shard sits a hair differently, so the light catches them apart.
        bowl *= 0.9 + 0.2 * hash21(vec2(id, id * 3.1)) * broken;
        col = mix(col, bowl, inBowl);
    }
    // The bowl's shadow on the table.
    col *= 1.0 - 0.35 * smoothstep(bowlR + 0.08, bowlR - 0.02, length((p - vec2(0.02, -0.03)) * vec2(1.0, 1.12)));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
