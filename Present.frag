// Present.frag
// Final present pass: copies the rendered frame to the screen, applying a
// single global brightness scale.  The scale is computed on the host as a
// photosensitivity safety limit on how fast the WHOLE-FRAME average luminance
// may change between frames — local pattern motion is untouched (uniform scale),
// only large full-screen flashes are reined in.
uniform sampler2D tex;
uniform vec2  resolution;
uniform float scale;

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 c  = texture2D(tex, uv).rgb;
    gl_FragColor = vec4(clamp(c * scale, 0.0, 1.0), 1.0);
}
