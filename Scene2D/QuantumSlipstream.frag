#version 330 core
out vec4 fragColor;
/**
 * @file QuantumSlipstream.frag
 * @brief QUANTUM SLIPSTREAM: An intense, high-speed journey through a warp tunnel.
 * Energetic, fluid-like bands of quantum energy twist and wrap around the camera,
 * pulsating violently to the beat.
 *   audioAdvance -> flight speed through the slipstream
 *   audioKick    -> high-frequency energy ripples and flashes
 *   audioSwell   -> tunnel width and overall brightness
 *   audioChromaHue-> palette offset for the quantum energies
 *
 * Per-activation variety:
 *   twistP float amount of twisting in the tunnel (0.5..2.0)
 *   energyP float intensity of the energy bands (0.5..1.5)
 *   hueP float palette offset (0..6.28)
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

uniform float twistP;
uniform float energyP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float tp = (twistP > 0.01 ? twistP : 1.0);
    float ep = (energyP > 0.01 ? energyP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    // Normalize coordinates centered at 0
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
    
    // Polar coordinates
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    
    // Warp speed
    float z = time * 5.0 + audioAdvance * 20.0;
    
    // Tunnel twisting
    float twist = a + r * 2.0 * tp * sin(time * 0.2 + audioPhase) + z * 0.1;
    
    // Create energy bands by sampling sine waves with different frequencies
    float band1 = sin(twist * 5.0 + z * 2.0);
    float band2 = sin(twist * 8.0 - z * 1.5);
    float band3 = sin(a * 12.0 + z * 3.0 + audioKick * 5.0); // high freq on kick
    
    // Interference pattern
    float pattern = band1 * band2 + band3 * 0.5;
    pattern = smoothstep(0.2, 0.8, abs(pattern));
    
    // Distance from center determines intensity (creating a tunnel effect)
    float tunnelWidth = 0.3 + 0.2 * audioSwell;
    float intensity = tunnelWidth / (r + 0.05);
    
    // Color mapping based on polar angle and time
    vec3 col1 = imgPalette(0.2 + audioCentroid * 0.2);
    vec3 col2 = imgPalette(0.8 + audioKick * 0.1);
    
    vec3 col = mix(col1, col2, sin(twist * 3.0) * 0.5 + 0.5);
    
    // Apply pattern and intensity
    col *= pattern * intensity * intensity * ep;
    
    // Flash effect on kick
    col += col2 * (audioKick * 1.5) * (1.0 / (r * 10.0 + 1.0));
    
    // Add some noise/particles flying past
    float particleNoise = fract(sin(dot(vec2(a, 1.0 / r + z), vec2(12.9898, 78.233))) * 43758.5453);
    float particles = step(0.98, particleNoise);
    col += col1 * particles * 5.0 * (1.0 + audioKick);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
