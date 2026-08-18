#version 330 core
out vec4 fragColor;
/**
 * @file HyperCube.frag
 * @brief Infinity-mirror cube (a la the Hyperspace Lighting Co. "HyperCube"): the
 * source image is wrapped onto the walls of an endlessly receding square
 * tunnel, so you fly INTO the picture through glowing cube frames that flash on
 * the beat.  A counter-rotating inner cube outline and a vanishing-point glow
 * complete the illusion.  The *image* is the star (was a 4% tint).  The tunnel
 * lurches forward on the beat (integrated advance), bass fattens the edges,
 * onset & downbeat flash, colours follow the harmony / mode.  Jump-free motion.
 */

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

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 pal(float t) { return imgPalette(t) * 1.35; }

void main()
{
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Gentle overall rotation (jump-free).
    p = rot(0.1 * sin(time * 0.1) + audioPhase * 0.10) * p;

    // Square (chamfer) radius -> nested square cube frames.
    float sq    = max(abs(p.x), abs(p.y));
    float depth = log(sq + 1e-3);
    float move  = time * 0.15 + audioAdvance * 0.35;   // travel inward, lurches on beats
    float z     = depth * 3.0 - move;

    // Glowing edge wherever z crosses an integer; bass fattens the edges.
    float ew    = 0.12 + 0.10 * audioBass;
    float frame = fract(z);
    float edge  = smoothstep(ew, 0.0, frame) + smoothstep(ew, 0.0, 1.0 - frame);
    edge *= 0.8 + 0.4 * sin(audioBeatPhase * 6.2831);  // in-tempo pulse

    // The image papered onto the receding tunnel walls: angle around the square
    // ring gives the horizontal, tunnel depth gives the vertical.
    float ring = (abs(p.x) > abs(p.y))
               ? (p.y / (abs(p.x) + 1e-3)) * 0.25 + (p.x < 0.0 ? 0.5 : 0.0)
               : (p.x / (abs(p.y) + 1e-3)) * 0.25 + (p.y < 0.0 ? 0.75 : 0.25);
    vec2  wuv = vec2(fract(ring), fract(z * 0.5));
    vec3  pic = img(wuv);
    float fade = exp(-1.5 * sq);                        // recede to infinity
    vec3  col  = pic * (0.35 + 1.1 * fade) * (0.5 + 0.7 * audioLevel);

    // Colour by depth + harmony; warmer in major, cooler in minor.
    float hue = fract(0.15 * floor(z) + audioChromaHue + 0.2 * audioValence
                      + 0.15 * (audioMode - 0.5));
    col += pal(hue) * edge * (0.7 + 0.6 * audioBeat + 0.5 * audioOnset);

    // Vanishing-point glow at the centre, flaring on downbeats.
    col += pal(fract(audioChromaHue + 0.5))
         * exp(-30.0 * sq * sq) * (0.5 + audioLevel + 0.8 * audioDownbeat);

    // Counter-rotating inner cube outline; its size pulses with the bass.
    vec2  qd    = rot(audioPhase * 0.30 + time * 0.05) * p;
    float inner = max(abs(qd.x), abs(qd.y));
    float isz   = 0.28 * (0.8 + 0.2 * sin(time * 0.3)) + 0.06 * audioBass;
    float ringE = smoothstep(0.02, 0.0, abs(inner - isz));
    col += pal(fract(hue + 0.3)) * ringE * (0.6 + audioBeat + 0.4 * audioSubBass);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
