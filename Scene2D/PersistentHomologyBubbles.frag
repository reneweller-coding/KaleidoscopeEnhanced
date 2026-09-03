#version 330 core
out vec4 fragColor;
/**
 * @file PersistentHomologyBubbles.frag
 * @brief PERSISTENT HOMOLOGY BUBBLES: topological data analysis made
 * visible.  A point cloud sampled from the photo (points where it is
 * bright); around every point a ball grows with the swell (the filtration
 * radius); where two balls touch an edge lights, where three close a
 * triangle fills -- the Vietoris-Rips complex -- and the holes that survive
 * a long range of radii (persistent features) glow.  The kick lights the
 * newest edges, the treble sparkles the points.  Camera still.
 *
 * Audio Reactivity:
 *   audioSwell   -> filtration radius (slow)
 *   sceneAdvance -> the point cloud breathes (continuous)
 *   audioKick    -> edge light (light)
 *   audioHigh    -> point sparkle (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: pointsP, spreadP, hueP.
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

uniform float pointsP;
uniform float spreadP;
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

vec2 pointAt(int i, float aspect, float spread, float clock)
{
    float fi = float(i);
    vec2 q = vec2((hash11(fi * 3.7) - 0.5) * aspect * spread, (hash11(fi * 5.3) - 0.5) * spread);
    q += 0.006 * vec2(sin(clock * (0.5 + hash11(fi * 7.1)) + fi), cos(clock * (0.4 + hash11(fi * 9.9)) + fi * 2.0));
    return q;
}

float segDist(vec2 p, vec2 a, vec2 b)
{
    vec2 d = b - a; float t = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    return length(p - (a + d * t));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    const int N = 26;
    int nPts = 14 + int(clamp(pointsP, 0.0, 1.0) * 12.0);
    float spread = 0.8 + 0.15 * clamp(spreadP, 0.0, 1.0);
    float radius = 0.06 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;

    // Background: the photo dark, the point cloud was sampled from it.
    vec3 col = img(gl_FragCoord.xy / resolution) * imgPalette(hue * 0.159 + 0.6) * 0.3 + vec3(0.03, 0.03, 0.045);
    vec3 ballCol = imgPalette(hue * 0.159 + 0.55) * 0.5 + 0.05;
    vec3 edgeCol = imgPalette(hue * 0.159 + 0.15) * 1.5 + 0.2;
    vec3 triCol = imgPalette(hue * 0.159 + 0.3) * 0.8;

    vec2 pts[N];
    for (int i = 0; i < N; ++i) pts[i] = pointAt(i, aspect, spread, clock);

    // Balls: translucent discs of the filtration radius.
    float ballCover = 0.0;
    for (int i = 0; i < N; ++i)
    {
        if (i >= nPts) break;
        float d = length(p - pts[i]);
        ballCover += smoothstep(radius, radius * 0.92, d) * 0.35;
    }
    col = mix(col, ballCol, clamp(ballCover, 0.0, 0.7));
    // Triangles (three balls pairwise touching): filled faintly.
    float tri = 0.0;
    for (int i = 0; i < N; ++i)
    {
        if (i >= nPts) break;
        for (int j = i + 1; j < N; ++j)
        {
            if (j >= nPts) break;
            float dij = length(pts[i] - pts[j]);
            if (dij > 2.0 * radius) continue;
            for (int k = j + 1; k < N; ++k)
            {
                if (k >= nPts) break;
                if (length(pts[i] - pts[k]) > 2.0 * radius || length(pts[j] - pts[k]) > 2.0 * radius) continue;
                // Point in triangle test.
                vec2 a = pts[i], b = pts[j], c = pts[k];
                float s1 = sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
                float s2 = sign((c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x));
                float s3 = sign((a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x));
                if (s1 == s2 && s2 == s3) tri += 0.35;
            }
        }
    }
    col = mix(col, triCol, clamp(tri, 0.0, 0.8));
    // Edges (two balls touching): lines, fading in as the balls meet (the
    // birth), lit by the kick.
    for (int i = 0; i < N; ++i)
    {
        if (i >= nPts) break;
        for (int j = i + 1; j < N; ++j)
        {
            if (j >= nPts) break;
            float dij = length(pts[i] - pts[j]);
            float born = smoothstep(2.0 * radius + 0.02, 2.0 * radius - 0.02, dij);
            if (born <= 0.0) continue;
            float d = segDist(p, pts[i], pts[j]);
            float fresh = 1.0 - smoothstep(2.0 * radius - 0.06, 2.0 * radius - 0.02, dij);
            col += edgeCol * smoothstep(0.004, 0.001, d) * born * (0.8 + 0.5 * audioKick * fresh);
        }
    }
    // Points: round, sparkling on the treble.
    for (int i = 0; i < N; ++i)
    {
        if (i >= nPts) break;
        float d = length(p - pts[i]);
        col = mix(col, vec3(1.0), smoothstep(0.012, 0.007, d));
        col += vec3(1.0) * exp(-d * 60.0) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.5;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
