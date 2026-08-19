#version 330 core
out vec4 fragColor;
/**
 * @file FerrohydrodynamicRosensweigSpikes.frag
 * @brief FERROHYDRODYNAMIC ROSENSWEIG SPIKES: Normal-field Rosensweig instability in magnetic
 * ferrofluids. Critical magnetic threshold breaks liquid surface into a highly ordered hexagonal
 * array of needle-sharp ferrofluid spikes with specular oily sheen and magnetic field texturing.
 *   audioAdvance -> navigates magnetic spike tip precession & ferrofluid surface wave modulation
 *   audioKick    -> flashes magnetic field pulse sharp spike apex elongation & glints
 *   audioBass    -> undulates overall magnetic induction field strength & spike height
 *   audioSwell   -> enriches ferrofluid oil surfactant sheen & specular reflection depth
 *   audioCentroid-> shifts colloidal magnetite nanoparticle suspension color spectra
 *
 * Per-activation variety:
 *   spikePitchP  float hexagonal Rosensweig spike packing density (2.5..7.0)
 *   sharpnessP   float ferrofluid spike needle tip sharpness     (1.0..4.0)
 *   sheenP       float oily surfactant specular reflection gain  (0.8..2.5)
 *   magneticAmpP float vertical magnetic field induction strength(0.6..2.2)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float spikePitchP;
uniform float sharpnessP;
uniform float sheenP;
uniform float magneticAmpP;

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

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Hexagonal lattice coordinates for Rosensweig spikes
    float pitch = (spikePitchP > 0.01 ? spikePitchP : 4.2);
    vec2 p = uv * pitch;
    
    vec2 r_hex = vec2(p.x * 1.7320508 + p.y, p.y * 2.0) / 3.0;
    vec2 cell = floor(r_hex);
    
    float minDist = 1e5;
    vec2 closestOffset = vec2(0.0);
    
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cartPos = vec2(sqrt(3.0) * (cell.x + neighbor.x + 0.5 * (cell.y + neighbor.y)), 1.5 * (cell.y + neighbor.y));
            vec2 diff = p - cartPos;
            float d = length(diff);
            if (d < minDist) {
                minDist = d;
                closestOffset = diff;
            }
        }
    }
    
    // Conical Rosensweig spike height profile: z(r) ~ exp(-r * sharpness)
    float kSharp = (sharpnessP > 0.01 ? sharpnessP : 2.5) * (1.0 + 0.4 * audioBass);
    float spikeHeight = exp(-minDist * kSharp);
    
    // Spike tip specular highlight (oily surfactant sheen)
    float specSheen = pow(spikeHeight, 3.5) * (sheenP > 0.01 ? sheenP : 1.3);
    
    // Magnetic pulse flash on kick
    float spikeFlash = pow(spikeHeight, 5.0) * (1.0 + 4.0 * audioKick);
    
    // Surface tension meniscus rings around spikes
    float meniscus = exp(-abs(minDist - 0.45) * 16.0);
    
    // Oily black ferrofluid color with photo palette iridescence
    vec3 blackFerro = vec3(0.08, 0.07, 0.1);
    vec3 ferroCol   = palTint(blackFerro, minDist * 0.4 + audioCentroid, 0.24);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.2;
    
    vec3 col = bg;
    col += ferroCol * (0.6 + 0.4 * spikeHeight) * (0.85 + 0.35 * audioSwell);
    col += vec3(0.95, 0.95, 1.0) * specSheen * 2.0;
    col += vec3(1.0, 0.95, 0.9) * spikeFlash * 2.5;
    col += ferroCol * meniscus * 1.4;
    col += ferroCol * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
