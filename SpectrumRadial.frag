// SpectrumRadial.frag
// -----------------------------------------------------------------------
// Radial 6-band spectrum analyzer built FROM the source image: the picture
// fills the central disc AND the surrounding petals, whose length tracks each
// frequency band's level and whose colour cycles per band.  So the analyzer is
// made of the image itself (was procedural petals with a tiny image disc).
// Pulses on the beat phase.
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

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

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

    float barEdge = 0.18 + 0.72 * amp;
    float petal   = smoothstep(barEdge, barEdge - 0.03, r) * smoothstep(0.14, 0.17, r);
    float disc    = smoothstep(0.17, 0.11, r);

    // Image sampled polar & mirrored inside each wedge -> the picture radiates.
    float wedge = abs(fract(ang * 6.0) * 2.0 - 1.0);           // 0..1 mirror
    vec2  pimg  = vec2(wedge, clamp((r - 0.15) * 1.6, 0.0, 1.0));
    vec3  pic   = img(pimg);

    float hue   = fract(fi / 6.0 + 0.12 * audioValence + time * 0.02);
    vec3  band  = hsv2rgb(vec3(hue, 0.7, 1.0));
    float pulse = 0.5 + 0.5 * sin(audioBeatPhase * 2.0 * PI);

    vec3 col = img(uv) * disc;                                 // central image disc
    col += pic * petal * band * (0.7 + 0.9 * pulse + amp + audioBeat);
    col += band * amp * exp(-4.0 * max(r - barEdge, 0.0)) * 0.3;   // outer glow

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
