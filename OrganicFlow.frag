// OrganicFlow.frag
// -----------------------------------------------------------------------
// Organic, reaction-diffusion-like flowing cells.  A stateless approximation
// of a Gray-Scott look (domain-warped fbm + sinusoidal banding) so it fits the
// per-frame pipeline without feedback buffers.
//   audioBass      -> membrane thickness / cell scale
//   audioStereo    -> horizontal stretch (wide stereo = wider cells)
//   audioDeltaPitch-> extra churn on melodic movement
//   audioValence/Centroid -> palette
//   audioPhase     -> smooth flow; audioBeat -> vein flash
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBass;
uniform float audioLevel;
uniform float audioBeat;
uniform float audioFlux;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioStereo;
uniform float audioPhase;
uniform float audioDeltaPitch;

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}
float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
    p.x *= 1.0 + audioStereo * 0.6;                  // stereo stretch

    float t = time * 0.08 + audioPhase * 0.2;

    vec2 q  = vec2(fbm(p * 2.0 + vec2(0.0, t)), fbm(p * 2.0 + vec2(5.2, t * 1.1)));
    vec2 rr = vec2(fbm(p * 2.0 + 3.0 * q + vec2(1.7, 9.2) + t * 0.5),
                   fbm(p * 2.0 + 3.0 * q + vec2(8.3, 2.8) - t * 0.5));
    float v = fbm(p * 2.5 + 4.0 * rr);

    float scale = 6.0 + 10.0 * audioBass + 4.0 * audioDeltaPitch;
    float band  = sin(v * scale + t * 2.0);
    float cells = smoothstep(0.0, 0.15, abs(band));  // veins between cells

    vec3 cool = vec3(0.10, 0.50, 0.55), warm = vec3(0.90, 0.45, 0.20);
    vec3 base = mix(cool, warm, audioValence);
    vec3 hi   = mix(vec3(0.20, 0.80, 0.70), vec3(1.0, 0.90, 0.50), audioCentroid);
    vec3 col  = mix(base * 0.2, hi, cells) * (0.6 + 0.8 * audioLevel);

    vec4 img = interpolation * texture2D(tex0, uv) + (1.0 - interpolation) * texture2D(tex1, uv);
    col = mix(col, col * (0.4 + 1.4 * img.rgb), 0.4);

    col += cells * audioBeat * vec3(0.30, 0.35, 0.40);
    col *= (1.0 + 0.2 * audioFlux);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
