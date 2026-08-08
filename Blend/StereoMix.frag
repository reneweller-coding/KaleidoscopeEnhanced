// StereoMix.frag
// Plain per-pixel cross-mix used ONLY for TRUE-STEREO 3D<->3D scene
// cross-fades: both inputs are eye-packed SBS/TB frames, so the blend must
// never move a pixel (any warp would fold content across the eye boundary).
// interpolation = 1 -> texA (the active scene), 0 -> texB (the incoming one)
// — the same weighting every combine style honours at its endpoints.
uniform sampler2D texA;
uniform sampler2D texB;
uniform vec2  resolution;
uniform float interpolation;

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 a = texture2D(texA, uv).rgb;
    vec3 b = texture2D(texB, uv).rgb;
    gl_FragColor = vec4(mix(b, a, interpolation), 1.0);
}
