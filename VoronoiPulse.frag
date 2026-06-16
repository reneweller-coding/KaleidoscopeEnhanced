// VoronoiPulse.frag
// -----------------------------------------------------------------------
// Animated Voronoi cells with glowing borders that flare on the beat.
//   audioPitch    -> cell density (higher pitch = more, smaller cells)
//   audioFlux     -> cell drift speed
//   audioValence  -> border colour (low = cool blue, high = warm orange)
//   audioBeat     -> border flare (slew-limited host-side, no strobe)
//   audioLevel/Centroid -> overall brightness
//   audioPhase    -> smooth animation offset
// The source image is sampled per cell, so the picture tiles into the cells.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioFlux;
uniform float audioPitch;
uniform float audioValence;
uniform float audioPhase;

vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    // Cell density from pitch.
    float scale = 3.0 + 6.0 * audioPitch;
    vec2  g  = p * scale;
    vec2  gi = floor(g);
    vec2  gf = fract(g);

    float d1 = 8.0;            // nearest distance
    float d2 = 8.0;            // second nearest
    vec2  cellId = vec2(0.0);

    for (int y = -1; y <= 1; y++)
    {
        for (int x = -1; x <= 1; x++)
        {
            vec2 o   = vec2(float(x), float(y));
            vec2 rnd = hash22(gi + o);
            // Animated cell centre; flux drives drift speed.
            vec2 c   = o + 0.5 + 0.4 * sin(time * (0.3 + 0.7 * audioFlux)
                                           + 6.2831 * rnd + audioPhase);
            float dd = length(c - gf);
            if (dd < d1) { d2 = d1; d1 = dd; cellId = gi + o; }
            else if (dd < d2) { d2 = dd; }
        }
    }

    float edge   = smoothstep(0.0, 0.08, d2 - d1);   // 1 inside cell, 0 on border
    float border = 1.0 - edge;

    // Per-cell image sample.
    vec2 cuv = (cellId / scale) * 0.5 + 0.5;
    vec4 img = interpolation * texture2D(tex0, cuv) + (1.0 - interpolation) * texture2D(tex1, cuv);

    vec3 cool    = vec3(0.25, 0.55, 1.00);
    vec3 warm    = vec3(1.00, 0.55, 0.25);
    vec3 edgeCol = mix(cool, warm, audioValence);

    vec3 col = img.rgb * (0.4 + 0.8 * audioLevel);
    col += border * edgeCol * (0.3 + 1.5 * audioBeat + 0.5 * audioCentroid);
    col *= (0.6 + 0.6 * edge + 0.4 * audioLevel);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
