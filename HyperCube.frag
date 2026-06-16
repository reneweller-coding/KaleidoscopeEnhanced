// HyperCube.frag
// -----------------------------------------------------------------------
// Infinity-mirror cube (à la the Hyperspace Lighting Co. "HyperCube"): glowing
// cube edges reflected into an endless receding tunnel, slowly rotating, with a
// counter-rotating inner cube outline and a vanishing-point glow.  Inspired by
// the object, extended with the music: the tunnel lurches forward on the beat
// (integrated advance), bass fattens the edges and the inner cube, onset &
// downbeat flash the whole frame, the glow pulses in tempo, and the colours
// follow the harmony / major-minor mode.  Motion is jump-free (anti-flicker).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;      // integrated rotation phase (jump-free)
uniform float audioAdvance;    // integrated travel into the tunnel (beat-lurch)
uniform float audioBeat;
uniform float audioBeatPhase;
uniform float audioOnset;
uniform float audioDownbeat;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioLevel;
uniform float audioValence;
uniform float audioMode;
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
    float move  = time * 0.15 + audioAdvance * 0.35;   // travel inward, lurches on beats
    float z     = depth * 3.0 - move;

    // Glowing edge wherever z crosses an integer; bass fattens the edges.
    float ew    = 0.12 + 0.10 * audioBass;
    float frame = fract(z);
    float edge  = smoothstep(ew, 0.0, frame) + smoothstep(ew, 0.0, 1.0 - frame);
    edge *= 0.8 + 0.4 * sin(audioBeatPhase * 6.2831);  // in-tempo pulse

    // Colour by depth + harmony; warmer in major, cooler in minor.
    float hue = fract(0.15 * floor(z) + audioChromaHue + 0.2 * audioValence
                      + 0.15 * (audioMode - 0.5));
    vec3  col = pal(hue) * edge;

    // Depth fade → receding-to-infinity feel; beat / onset punch the edges.
    float fade = exp(-1.5 * sq);
    col *= (0.4 + 1.2 * fade);
    col *= (0.7 + 0.6 * audioBeat + 0.5 * audioOnset);

    // Vanishing-point glow at the centre, flaring on downbeats.
    col += pal(fract(audioChromaHue + 0.5))
         * exp(-30.0 * sq * sq) * (0.5 + audioLevel + 0.8 * audioDownbeat);

    // Counter-rotating inner cube outline; its size pulses with the bass.
    vec2  qd    = rot(audioPhase * 0.30 + time * 0.05) * p;
    float inner = max(abs(qd.x), abs(qd.y));
    float isz   = 0.28 * (0.8 + 0.2 * sin(time * 0.3)) + 0.06 * audioBass;
    float ring  = smoothstep(0.02, 0.0, abs(inner - isz));
    col += pal(fract(hue + 0.3)) * ring * (0.6 + audioBeat + 0.4 * audioSubBass);

    // Faint image tint in the background.
    col += 0.04 * texture2D(tex0, uv).rgb;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
