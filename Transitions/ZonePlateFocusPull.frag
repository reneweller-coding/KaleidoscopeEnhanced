#version 330 core
out vec4 fragColor;
/**
 * @file ZonePlateFocusPull.frag
 * @brief TRANSITION ZONE PLATE FOCUS PULL: a Fresnel zone plate takes the
 * outgoing scene apart into its rings and pulls the incoming one into focus
 * through the same rings.
 *
 * A zone plate's rings sit at radii proportional to the square root of their
 * index, which means the pattern is a CHIRP in radius squared -- widely spaced
 * at the centre, crowding toward the rim.  Evenly spaced rings would be a
 * target, not a lens, and would not do the one thing that makes this read: as
 * the focal length is pulled, the whole chirp breathes through itself, rings
 * appearing at the centre and running outward without any of them jumping.
 *
 * Focus is done the way a lens loses it: the picture is sampled at several
 * radii around each point, spread by how far off focus that image is.  The
 * outgoing scene starts sharp and goes soft, the incoming does the reverse, and
 * the rings decide which of the two is being let through at each radius.
 *
 * Audio Reactivity:
 *   audioSubBass -> the focal length, i.e. how fast the rings breathe (slow)
 *   audioHigh    -> the rings' contrast (light)
 *   audioSwell   -> how far out of focus the far image goes (slow)
 *   audioKick    -> the light on the ring crests (light)
 *
 * Per-activation variety: zonesP, blurP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float zonesP;
uniform float blurP;
uniform float hueP;

const float PI = 3.14159265358979;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Out of focus: a ring of samples at radius r, which is what a lens actually
// spreads a point into.
vec3 defocus(sampler2D tx, vec2 uv, float r, vec2 sc)
{
    if (r < 0.0015) return texture(tx, clamp(uv, 0.0, 1.0)).rgb;
    vec3 s = vec3(0.0);
    for (int i = 0; i < 8; ++i)
    {
        float a = 6.2831853 * float(i) / 8.0 + 0.3;
        s += texture(tx, clamp(uv + vec2(cos(a), sin(a)) * r * sc, 0.0, 1.0)).rgb;
    }
    return s / 8.0;
}

void main()
{
    float zn   = (zonesP > 0.0) ? zonesP : 1.0;
    float blur = (blurP  > 0.0) ? blurP  : 1.0;
    float hue  = (hueP   > 0.0) ? hueP   : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);
    vec2  sc = vec2(1.0 / aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    float r2 = dot(p, p);

    // The chirp: ring index goes with r^2, so the rings crowd toward the rim.
    // The focal term sweeps across the turn, which makes the whole pattern
    // breathe through itself instead of sliding.
    float focal = mix(9.0, 34.0, d) * zn * (0.85 + 0.35 * clamp(audioSubBass, 0.0, 1.0));
    float phase = focal * r2 * 6.2831853;
    float zone  = 0.5 + 0.5 * cos(phase);
    // Real zone plates are hard-edged; softening only at the crowded rim keeps
    // the ring count from aliasing into moire.
    float crowd = clamp(1.0 - fwidth(phase) * 0.55, 0.0, 1.0);
    zone = mix(0.5, smoothstep(0.32, 0.68, zone), crowd);

    // Focus: the outgoing image is going soft, the incoming coming sharp.
    float spread = 0.055 * blur * arc * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 a = defocus(tex0, uv, spread * d,         sc);
    vec3 b = defocus(tex1, uv, spread * (1.0 - d), sc);

    // The rings decide which image is let through where; away from the middle
    // of the turn the choice collapses onto the plain cross-fade.
    float pick = mix(d, mix(d * 0.35, 0.35 + d * 0.65, zone), arc);
    vec3 col = mix(a, b, clamp(pick, 0.0, 1.0));

    // The crests carry the light, the troughs are where the plate is opaque.
    col *= 1.0 + (zone - 0.5) * 0.55 * arc * (0.6 + 0.8 * clamp(audioHigh * 2.0, 0.0, 1.0));
    col += vec3(0.80, 0.86, 1.0) * clamp(zone - 0.72, 0.0, 0.3) * arc
         * (0.12 + 0.55 * clamp(audioKick, 0.0, 1.0));

    if (hue > 0.001) col = hueRot(col, hue * arc * 0.30);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
