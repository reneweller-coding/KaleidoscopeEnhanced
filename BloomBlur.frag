// BloomBlur.frag
// -----------------------------------------------------------------------
// One pass of the two-pass Gaussian bloom (quarter-resolution).
//   Pass 1 (dir = (1,0), threshold > 0): samples the full-res frame, extracts
//     the bright parts (per tap) and blurs horizontally while downsampling.
//   Pass 2 (dir = (0,1), threshold = 0): blurs the result vertically.
// The blurred bright field is added back in Present.frag — a proper soft glow
// instead of the old single-tap mip hack (which showed blocky artefacts).
// -----------------------------------------------------------------------

uniform sampler2D tex;
uniform vec2  resolution;   // TARGET (bloom buffer) resolution
uniform vec2  dir;          // blur direction in target pixels
uniform float threshold;    // >0 -> bright-pass extract (first pass only)

vec3 tap(vec2 uv)
{
    vec3 c = texture2D(tex, uv).rgb;
    if (threshold > 0.0)
        c = max(c - threshold, vec3(0.0)) * 1.6;
    return c;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = dir / resolution;

    // 9-tap Gaussian (sigma ~2), unrolled for GLSL 1.10/1.20 compatibility.
    vec3 c = tap(uv) * 0.227027;
    c += tap(uv + px * 1.0) * 0.1945946;
    c += tap(uv - px * 1.0) * 0.1945946;
    c += tap(uv + px * 2.0) * 0.1216216;
    c += tap(uv - px * 2.0) * 0.1216216;
    c += tap(uv + px * 3.0) * 0.0540540;
    c += tap(uv - px * 3.0) * 0.0540540;
    c += tap(uv + px * 4.0) * 0.0162162;
    c += tap(uv - px * 4.0) * 0.0162162;

    gl_FragColor = vec4(c, 1.0);
}
