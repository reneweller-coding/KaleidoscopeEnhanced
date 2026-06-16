// PlasmaFlow.frag
// -----------------------------------------------------------------------
// Classic flowing plasma (sum of sines) tinted by mood.
//   audioArousal -> plasma scale / busyness
//   audioPhase   -> smooth flow speed (jump-free)
//   audioPitch/Centroid -> hue
//   audioValence -> saturation (pleasant = vivid, tense = washed out)
//   audioLevel/Beat -> brightness
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
uniform float audioArousal;
uniform float audioValence;
uniform float audioPhase;

vec3 hsv2rgb(vec3 c)
{
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    float t = time * 0.2 + audioPhase * 0.5;

    float scale = 4.0 + 6.0 * audioArousal;
    vec2  q = p * scale;
    float v = sin(q.x + t);
    v += sin(q.y * 1.3 + t * 1.1);
    v += sin((q.x + q.y) * 0.7 + t * 0.8);
    float cx = q.x + 2.0 * sin(t * 0.3);
    float cy = q.y + 2.0 * cos(t * 0.4);
    v += sin(sqrt(cx * cx + cy * cy) * 1.2 + t * 1.5);
    v *= 0.25;   // back into ~[-1, 1]

    float hue = fract(0.5 + 0.5 * v + 0.15 * audioPitch + 0.10 * audioCentroid);
    float sat = 0.4 + 0.6 * audioValence;
    float val = 0.35 + 0.55 * audioLevel + 0.3 * audioBeat;
    vec3  col = hsv2rgb(vec3(hue, sat, val));

    // Source image breathes through.
    vec4 img = interpolation * texture2D(tex0, uv) + (1.0 - interpolation) * texture2D(tex1, uv);
    col = mix(col, col * (0.5 + 1.3 * img.rgb), 0.4);

    col *= (1.0 + 0.2 * audioFlux);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
