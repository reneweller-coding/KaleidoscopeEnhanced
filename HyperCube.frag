// HyperCube.frag
// -----------------------------------------------------------------------
// Infinity-mirror cube (à la the Hyperspace Lighting Co. "HyperCube"): glowing
// cube edges reflected into an endless receding tunnel, slowly rotating, with a
// counter-rotating inner cube outline and a vanishing-point glow.  Colours
// follow the harmony (chroma hue) and depth; the beat pulses the edges.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;      // integrated rotation phase (jump-free)
uniform float audioAdvance;    // integrated travel into the tunnel
uniform float audioBeat;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Gentle overall rotation (jump-free).
    p = rot(0.1 * sin(time * 0.1) + audioPhase * 0.10) * p;

    // Square (chamfer) radius → nested square cube frames.
    float sq    = max(abs(p.x), abs(p.y));
    float depth = log(sq + 1e-3);
    float move  = time * 0.15 + audioAdvance * 0.25;   // travel inward
    float z     = depth * 3.0 - move;

    // Glowing edge wherever z crosses an integer (a reflected cube frame).
    float frame = fract(z);
    float edge  = smoothstep(0.12, 0.0, frame) + smoothstep(0.12, 0.0, 1.0 - frame);

    float hue = fract(0.15 * floor(z) + audioChromaHue + 0.2 * audioValence);
    vec3  col = pal(hue) * edge;

    // Depth fade → the receding-to-infinity feel; beat pulses the edges.
    float fade = exp(-1.5 * sq);
    col *= (0.4 + 1.2 * fade);
    col *= (0.7 + 0.6 * audioBeat);

    // Vanishing-point glow at the centre.
    col += pal(fract(audioChromaHue + 0.5)) * exp(-30.0 * sq * sq) * (0.5 + audioLevel);

    // Counter-rotating inner cube outline for the solid "cube" read.
    vec2  qd    = rot(audioPhase * 0.30 + time * 0.05) * p;
    float inner = max(abs(qd.x), abs(qd.y));
    float ring  = smoothstep(0.02, 0.0, abs(inner - 0.28 * (0.8 + 0.2 * sin(time * 0.3))));
    col += pal(fract(hue + 0.3)) * ring * (0.6 + audioBeat);

    // Faint image tint in the background.
    col += 0.04 * texture2D(tex0, uv).rgb;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
