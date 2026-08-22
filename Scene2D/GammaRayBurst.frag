#version 330 core
out vec4 fragColor;
/**
 * @file GammaRayBurst.frag
 * @brief GAMMA RAY BURST: The most powerful explosion in the universe. We are 
 * looking almost directly down the barrel of a massive dying star as it fires 
 * an ultra-relativistic jet of blinding gamma radiation. The beam violently 
 * distorts space and pulses brutally to the audio.
 *   audioAdvance -> velocity of the relativistic particles
 *   audioKick    -> catastrophic spikes in beam intensity
 *   audioSwell   -> overall blinding brightness of the burst
 *   audioChromaHue-> palette offset for the extreme plasma
 *
 * Per-activation variety:
 *   beamP float focus and narrowness of the central beam (0.5..1.5)
 *   shockP float intensity of the surrounding shockwaves (0.5..2.0)
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

uniform float beamP;
uniform float shockP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float bp = (beamP > 0.01 ? beamP : 1.0);
    float sp = (shockP > 0.01 ? shockP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    // We are looking directly at the center
    float dist = length(uv);
    float angle = atan(uv.y, uv.x);
    
    vec3 col = vec3(0.0);
    vec3 beamColor = imgPalette(0.8 + audioCentroid * 0.1); // Blinding, hot energy
    vec3 shockColor = imgPalette(0.2); // Outer ejected material
    
    // 1. The Central Beam (Gamma Ray Jet)
    // The jet is extremely focused, coming straight at the camera.
    // We create a perspective illusion of a tunnel of light.
    
    // Wobbly, relativistic distortion of the beam
    float beamWobble = fbm(vec3(angle * 2.0, time * 2.0, 0.0)) * 0.05;
    float distDistort = dist + beamWobble;
    
    // The core of the beam is infinitely bright and tiny
    float beamCoreRadius = 0.05 / bp;
    float core = exp(-distDistort * (50.0 * bp));
    
    // Relativistic particles shooting outwards from the center (Z-axis illusion)
    // Map 2D to a 3D cylindrical tunnel
    float tunnelZ = 1.0 / max(distDistort, 0.001);
    float tunnelU = angle * 2.0; // wrap around
    float tunnelV = tunnelZ - (time * 10.0 + audioAdvance * 20.0); // rushing towards us
    
    // High frequency noise for the chaotic plasma
    float plasma = fbm(vec3(tunnelU * 5.0, tunnelV * 2.0, time));
    float plasmaStrands = step(0.7, plasma);
    
    // Combine core and plasma
    float beamIntensity = core + (plasmaStrands * exp(-distDistort * 10.0));
    
    // Audio Kick triggers catastrophic spikes in the beam
    float kickSpike = step(0.9, hash11(floor(time * 8.0))) * audioKick * 10.0;   // was 15 Hz
    beamIntensity *= (1.0 + kickSpike);
    
    col += beamColor * beamIntensity * (1.0 + audioSwell * 2.0);
    
    // 2. Surrounding Accretion Disk / Dying Star Remnant
    // The material being violently ripped apart and blown away laterally
    if (dist > 0.1) {
        // Shockwave rings expanding outwards
        float expandSpeed = time * 2.0 + audioAdvance * 3.0;
        float rings = sin(dist * 50.0 - expandSpeed);
        float ringMask = smoothstep(0.9, 1.0, rings);
        
        // Break rings into turbulent debris
        float debris = fbm(vec3(angle * 10.0, dist * 5.0, time * 2.0));
        float ejecta = ringMask * debris * sp;
        
        // Ejecta gets destroyed/fades as it gets pushed further out
        float ejectaFade = exp(-(dist - 0.1) * 5.0);
        
        col += shockColor * ejecta * ejectaFade * (1.0 + audioKick * 3.0) * (0.5 + audioSwell);
        
        // A massive lateral shockwave (equatorial plane of the star)
        // We approximate it by creating a bright horizontal line that is distorted
        float lateral = abs(uv.y + fbm(vec3(uv.x * 5.0, time, 0.0)) * 0.1);
        float lateralWave = exp(-lateral * 20.0) * exp(-abs(uv.x) * 2.0);
        col += beamColor * lateralWave * sp * (1.0 + audioKick * 5.0);
    }
    
    // 3. Glare and Lens effects (the energy is overwhelming)
    // Massive radial glare rays
    float rays = fbm(vec3(angle * 20.0, time * 0.5, 0.0));
    float raysMask = smoothstep(0.6, 0.9, rays) * exp(-dist * 3.0);
    col += beamColor * raysMask * 0.5 * (1.0 + audioKick * 2.0);
    
    // Overall blinding haze
    float haze = exp(-dist * 2.0);
    col += beamColor * haze * 0.3 * (1.0 + audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
