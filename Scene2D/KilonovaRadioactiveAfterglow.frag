#version 330 core
out vec4 fragColor;
/**
 * @file KilonovaRadioactiveAfterglow.frag
 * @brief KILONOVA RADIOACTIVE AFTERGLOW: Binary neutron star merger fireball.
 * Expanding relativistic ejecta cloud synthesis of heavy r-process elements (gold, platinum),
 * lanthanide-rich line opacity absorption, shock break-out gamma flash, and photo texturing.
 *   audioAdvance -> drives relativistic ejecta fireball expansion & turbulent billows
 *   audioKick    -> ignites gamma-ray burst shock break-out flashes
 *   audioSwell   -> swells dense radioactive core thermal luminosity
 *   audioBass    -> undulates magneto-hydrodynamic ejecta filament tearing
 *   audioCentroid-> shifts lanthanide absorption edge spectra
 *
 * Per-activation variety:
 *   ejectaP  float merger ejecta velocity & turbulence scale (0.6..2.0)
 *   coreP    float radioactive central engine hotness       (0.8..2.5)
 *   lanthP   float lanthanide opacity absorption strength   (0.5..2.2)
 *   shockP   float shock break-out ray intensity           (0.4..1.8)
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

uniform float ejectaP;
uniform float coreP;
uniform float lanthP;
uniform float shockP;

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
    float t = time * 0.35 + audioAdvance * 0.35;

    float r = length(uv);
    float theta = atan(uv.y, uv.x);

    // Turbulent fractal ejecta noise
    float scale = (ejectaP > 0.01 ? ejectaP : 1.2);
    vec2 p = uv * scale;
    float turb = 0.0;
    float amp = 0.5;
    vec2 shift = vec2(cos(t * 0.4), sin(t * 0.3)) * 0.2;

    for (int i = 0; i < 4; i++) {
        p = vec2(p.x * cos(0.6) - p.y * sin(0.6), p.x * sin(0.6) + p.y * cos(0.6)) * 1.8 + shift;
        turb += amp * (sin(p.x * 2.5 + t) * cos(p.y * 2.5 - t));
        amp *= 0.5;
    }

    float ejectaDist = r + turb * 0.12 * (0.8 + 0.5 * audioBass);

    // Core radioactive engine (thermal glow)
    float coreRadius = 0.15 * (coreP > 0.01 ? coreP : 1.0) * (1.0 + 0.3 * audioSubBass);
    float coreGlow = exp(-ejectaDist / max(coreRadius, 0.01)) * (1.0 + 2.5 * audioKick);

    // Lanthanide opacity curtain (outer absorbing shells)
    float lanthOpacity = (lanthP > 0.01 ? lanthP : 1.2);
    float shell = exp(-abs(ejectaDist - 0.45) * 6.0 * lanthOpacity);

    // Shock break-out rays
    float rays = pow(sin(theta * 8.0 + turb * 3.0 + t * 1.5) * 0.5 + 0.5, 3.0);
    rays *= exp(-r * 2.0) * (shockP > 0.01 ? shockP : 1.0) * (0.8 + 1.2 * audioHigh);

    // Color synthesis: Incandescent gold/platinum core tinted toward photo palette
    vec3 goldCore = vec3(1.0, 0.75, 0.2);
    vec3 deepCrimson = vec3(0.7, 0.12, 0.08);
    vec3 lanthanidePurple = vec3(0.4, 0.05, 0.55);

    vec3 coreColor = palTint(goldCore, 0.05, 0.22);
    vec3 shellColor = palTint(mix(deepCrimson, lanthanidePurple, shell), ejectaDist * 0.3, 0.28);
    vec3 rayColor = palTint(vec3(1.0, 0.9, 0.7), audioCentroid, 0.25);

    // Background photo texture
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;

    vec3 col = bg;
    col += shellColor * shell * (0.9 + 0.6 * audioSwell);
    col += coreColor * coreGlow * 2.5;
    col += rayColor * rays * 1.4;
    col += palTint(vec3(1.0, 0.4, 0.1), turb * 0.2, 0.25) * (audioKick * 0.4);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    col *= 0.71;   // measured luma 0.707: knee, not a linear trim
    col /= 1.0 + 0.45 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
