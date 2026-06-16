// SpectrumRadial.frag
// -----------------------------------------------------------------------
// Radial 6-band spectrum analyzer: the six frequency bands become petals
// around a central disc that shows the source image.  Pulses on the beat
// phase; petal length tracks each band's level.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioSubBass;
uniform float audioBass;
uniform float audioLowMid;
uniform float audioMid;
uniform float audioUpperMid;
uniform float audioHigh;
uniform float audioBeat;
uniform float audioBeatPhase;
uniform float audioValence;
uniform float audioPhase;

const float PI = 3.14159265358979;

vec3 hsv2rgb(vec3 c)
{
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
    float r = length(p);
    float a = atan(p.y, p.x) + audioPhase * 0.2;     // slow rotation
    float ang = a / (2.0 * PI) + 0.5;                // 0..1

    // 12 mirrored sectors -> 6 bands.
    float seg = floor(ang * 12.0);
    float fi  = mod(seg, 6.0);
    float amp = audioSubBass;
    if (fi > 0.5) amp = audioBass;
    if (fi > 1.5) amp = audioLowMid;
    if (fi > 2.5) amp = audioMid;
    if (fi > 3.5) amp = audioUpperMid;
    if (fi > 4.5) amp = audioHigh;

    float barEdge = 0.18 + 0.65 * amp;
    float ring    = smoothstep(barEdge, barEdge - 0.03, r) * smoothstep(0.14, 0.17, r);

    vec4 img = interpolation * texture2D(tex0, uv) + (1.0 - interpolation) * texture2D(tex1, uv);

    float hue   = fract(fi / 6.0 + 0.12 * audioValence + time * 0.02);
    vec3  petal = hsv2rgb(vec3(hue, 0.7, 1.0));
    float pulse = 0.5 + 0.5 * sin(audioBeatPhase * 2.0 * PI);

    vec3 col = img.rgb * smoothstep(0.17, 0.11, r);                 // central image disc
    col += ring * petal * (0.6 + 0.8 * pulse + audioBeat);          // petals
    col += petal * amp * exp(-4.0 * max(r - barEdge, 0.0)) * 0.3;   // outer glow

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
