#version 330 core
out vec4 fragColor;
/**
 * @file RelativisticPlasmaZpinchInstability.frag
 * @brief RELATIVISTIC PLASMA Z-PINCH INSTABILITY: Megampere relativistic pulsed-power Z-pinch.
 * Intense axial plasma current self-compresses via azimuthal Lorentz force, degenerating into
 * violent m=0 (sausage) and m=1 (kink) magneto-Rayleigh-Taylor instabilities and fusion hot spots.
 *   audioAdvance -> drives relativistic axial current flow & magnetic pinch dynamics
 *   audioKick    -> ignites thermonuclear fusion hotspot micro-detonations
 *   audioBass    -> pulses azimuthal magnetic pinch Lorentz compression force
 *   audioSwell   -> thickens dense bremsstrahlung emission haze & pinch diameter
 *   audioCentroid-> shifts high-temperature plasma X-ray/EUV emission spectra
 *
 * Per-activation variety:
 *   kinkAmpP     float m=1 helical kink instability amplitude   (0.5..2.2)
 *   sausageP     float m=0 necking sausage mode wavelength      (4.0..16.0)
 *   pinchRadiusP float central dense plasma pinch radius        (0.08..0.35)
 *   xrayGlowP    float thermonuclear hot-spot X-ray brightness   (0.8..2.5)
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

uniform float kinkAmpP;
uniform float sausageP;
uniform float pinchRadiusP;
uniform float xrayGlowP;

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
    float t = time * 0.45 + audioAdvance * 0.4;
    
    // Axial current along Y-axis with helical m=1 kink displacement
    float kinkAmp = (kinkAmpP > 0.01 ? kinkAmpP : 1.0) * (0.15 + 0.1 * sin(t * 0.6));
    float kinkX = sin(uv.y * 6.0 + t * 3.0 + audioPhase) * kinkAmp;
    
    float dx = uv.x - kinkX;
    
    // m=0 sausage mode (necking along axis where radius squeezes to near zero)
    float sausageFreq = (sausageP > 0.01 ? sausageP : 8.0);
    float sausageNecks = sin(uv.y * sausageFreq - t * 2.0) * 0.5 + 0.5;
    
    // Plasma pinch core radius
    float baseR = (pinchRadiusP > 0.01 ? pinchRadiusP : 0.18) * (1.0 - 0.3 * audioBass);
    float pinchR = baseR * (0.35 + 0.65 * sausageNecks);
    
    float r = abs(dx);
    float inCore = smoothstep(pinchR + 0.05, pinchR - 0.02, r);
    
    // Thermonuclear fusion hotspots at necking pinch points
    float hotSpot = (1.0 - sausageNecks) * exp(-r * 25.0) * (1.0 + 4.0 * audioKick) * (xrayGlowP > 0.01 ? xrayGlowP : 1.5);
    
    // Azimuthal B-field streamlines and helical return current cage
    float bField = sin(uv.y * 18.0 + dx * 25.0 - t * 4.0) * exp(-r * 3.0);
    
    // Bremsstrahlung radiation colors: High-energy plasma X-ray violet-white core tinted by photo
    vec3 plasmaCore = vec3(1.0, 0.95, 0.85);
    vec3 xRayViolet  = vec3(0.55, 0.25, 0.95);
    vec3 hotPink     = vec3(1.0, 0.15, 0.45);
    
    vec3 coreColor = palTint(mix(xRayViolet, hotPink, sausageNecks), uv.y * 0.2 + audioCentroid, 0.25);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += coreColor * inCore * (0.8 + 0.5 * audioSwell);
    col += vec3(0.9, 0.95, 1.0) * hotSpot * 2.8;
    col += palTint(vec3(0.1, 0.7, 1.0), uv.y * 0.3, 0.22) * abs(bField) * 1.4;
    col += coreColor * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
