#version 330 core
out vec4 fragColor;
/**
 * @file CosmicStringCuspKinkGravitationalRadiation.frag
 * @brief COSMIC STRING CUSP KINK GRAVITATIONAL RADIATION: Relativistic cosmic string loops
 * formed in early universe phase transitions. Sub-luminal loop oscillations periodically form
 * light-speed cusps and kinks, emitting beamed gravitational wave bursts and spacetime lensing halos.
 * A NETWORK of 160 loops scattered through the whole view volume (frustum-spread, so a far loop is
 * drawn as large as a near one) rather than the single central tangle it used to be.
 *   audioAdvance -> navigates relativistic string loop oscillation & cusp formation
 *   audioKick    -> flashes light-speed cusp gravitational radiation burst beams
 *   audioSwell   -> widens string tension energy density & gravitational lensing halo
 *   audioCentroid-> shifts primordial topological defect emission color spectra
 *
 * Per-activation variety:
 *   cuspGlowP   float light-speed cusp peak luminance gain  (0.8..2.5)
 *   lensingP    float gravitational lensing halo intensity   (0.6..2.2)
 */

in vec3 vPos;
in float vDepth;
in float vGlow;
in float vSideT;   // -1 .. +1 across the cord

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float cuspGlowP;
uniform float lensingP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main() {
    // Primordial cosmic string deep electric azure / gold cusp identity
    vec3 stringCol = vec3(0.2, 0.7, 1.0);
    vec3 cuspCol   = palTint(stringCol, vDepth * 0.4 + audioCentroid, 0.25);
    
    // The network now spans the whole view volume, so the photo lookup runs
    // at a much gentler scale -- at the old 0.3 it wrapped many times per
    // loop and read as noise instead of as photograph.
    vec2 photoUv = fract(vPos.xy * 0.03 + 0.5);
    vec3 photoSample = img(photoUv);

    // Transverse profile across the cord: cylindrical shading, bright along
    // the spine and falling to a lit rim rather than to nothing.  The pass is
    // opaque and depth-tested, so the cord must stay a solid lit cord all the
    // way to its edge -- fading it out would leave dark bands sitting in front
    // of every loop behind it.  The gravitational-lensing rim is the first
    // thing lensingP has ever actually driven (it widens the cord upstream).
    float x    = clamp(vSideT, -1.0, 1.0);
    float lens = (lensingP > 0.01 ? lensingP : 1.2);
    float prof = 0.42 + 0.58 * sqrt(max(0.0, 1.0 - x * x))
               + 0.10 * lens * smoothstep(0.72, 1.0, abs(x));

    vec3 col = cuspCol * (0.6 + 0.4 * photoSample) * vGlow * prof;
    col *= (cuspGlowP > 0.01 ? cuspGlowP : 1.2) * (0.85 + 0.35 * audioSwell);
    // The kick flash rides the same profile: applied flat it would have lit
    // the entire halo band on every beat.
    col += vec3(1.0, 0.95, 0.8) * (audioKick * 0.35) * prof;

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
