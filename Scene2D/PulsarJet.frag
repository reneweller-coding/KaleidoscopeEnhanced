#version 330 core
out vec4 fragColor;
/**
 * @file PulsarJet.frag
 * @brief PULSAR JET: A highly energetic, rapidly spinning neutron star emitting
 * blinding relativistic jets. The accretion disk and jets pulsate violently to 
 * the music's beat, while the camera orbits the system.
 *   audioAdvance -> camera orbit speed around the pulsar
 *   audioKick    -> intense energy pulses traveling along the jet
 *   audioSwell   -> brightness of the accretion disk and surrounding gas
 *   audioChromaHue-> base palette offset for the extreme energy radiation
 *
 * Per-activation variety:
 *   energyP float overall energy output / brightness (0.7..1.5)
 *   spinP float base rotation speed of the pulsar (0.5..2.0)
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

uniform float energyP;
uniform float spinP;
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

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

void main()
{
    float ep = (energyP > 0.01 ? energyP : 1.0);
    float sp = (spinP > 0.01 ? spinP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.1 + audioAdvance * 0.2;
    
    // Camera orbit
    vec3 ro = vec3(3.0 * cos(t), 1.0 * sin(t * 0.5), 3.0 * sin(t));
    vec3 ta = vec3(0.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    // Extreme camera shake on kicks
    float shake = audioKick * 0.05;
    vec2 shakeUv = uv + vec2(hash11(time * 100.0), hash11(time * 100.0 + 1.0)) * shake - (shake * 0.5);
    
    vec3 rd = normalize(shakeUv.x * uu + shakeUv.y * vv + 1.5 * ww);
    
    // Raymarching volumetric energy field
    float d = 0.0;
    vec3 p;
    vec3 col = vec3(0.0);
    
    vec3 coreColor = imgPalette(0.8 + audioCentroid * 0.2);
    vec3 jetColor = imgPalette(0.1 + audioKick * 0.1);
    
    // Tilt the system
    mat2 tilt = rot(0.5);

    // Fast rotation of the pulsar
    float fastSpin = time * 10.0 * sp + audioPhase * 5.0;

    for(int i = 0; i < 60; i++) {
        p = ro + rd * d;
        
        // System transform
        vec3 sp = p;
        sp.yz = tilt * sp.yz;
        sp.xz = rot(fastSpin) * sp.xz;
        
        // Accretion disk
        float r = length(sp.xz);
        float disk = abs(sp.y) - 0.05 * (1.0 + r); // flares outward slightly
        float diskDens = smoothstep(2.0, 0.5, r) * smoothstep(0.1, 0.5, r);
        float diskNoise = fbm(vec3(sp.xz * 5.0, time * 2.0));
        
        if (disk < 0.1 && diskDens > 0.0) {
            float alpha = (0.1 - disk) * 10.0 * diskDens * diskNoise;
            col += coreColor * alpha * (1.0 + audioSwell * 2.0) * ep * 0.05;
        }
        
        // Central star (core)
        float coreDist = length(sp);
        if (coreDist < 0.2) {
            float coreAlpha = (0.2 - coreDist) * 20.0;
            col += vec3(1.0, 0.9, 0.8) * coreAlpha * ep * 0.2;
        }
        
        // Jets
        float jetRadius = 0.05 + abs(sp.y) * 0.1; // jets widen
        float jet = length(sp.xz) - jetRadius;
        if (jet < 0.0 && abs(sp.y) > 0.15) {
            // Pulses traveling up/down the jet
            float pulse = step(0.8, fract(abs(sp.y) * 2.0 - time * 20.0 - audioKick * 2.0));
            float jetNoise = fbm(vec3(sp.xz * 10.0, sp.y - time * 30.0));
            
            float alpha = (0.0 - jet) * 20.0 * jetNoise;
            float fade = exp(-abs(sp.y) * 0.5);
            
            col += jetColor * alpha * fade * (1.0 + pulse * 5.0 * audioKick) * ep * 0.1;
        }
        
        // Volumetric scattering/halo
        col += coreColor * exp(-coreDist * 3.0) * (0.01 + audioSwell * 0.02) * ep;
        
        d += 0.05 + d * 0.02; // step size
        if(d > 8.0) break;
    }
    
    // Add intense starfield background
    vec3 bgCol = vec3(0.0);
    for (int i = 0; i < 2; ++i) {
        float sc = 80.0 + 50.0 * float(i);
        vec3 st = rd * sc;
        vec3 cell = floor(st);
        vec3 f = fract(st) - 0.5;
        if (hash11(dot(cell, vec3(12.3, 45.6, 78.9))) > 0.98) {
            bgCol += mix(jetColor, coreColor, hash11(cell.x)) * exp(-length(f) * length(f) * 400.0);
        }
    }
    col += bgCol * (0.2 + audioSwell * 0.5);

    // Vignette / brightness boost
    col *= 1.5;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
