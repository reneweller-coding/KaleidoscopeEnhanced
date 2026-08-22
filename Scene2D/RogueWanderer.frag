#version 330 core
out vec4 fragColor;
/**
 * @file RogueWanderer.frag
 * @brief ROGUE WANDERER: An icy, dark planet drifting entirely without a star 
 * in the cold depths of interstellar space. It is illuminated only by intensely 
 * glowing volcanic fissures that pulse to the beat.
 *   audioAdvance -> slow rotation of the rogue planet
 *   audioKick    -> volcanic eruptions and fissure flashes
 *   audioSwell   -> ambient glow of the magma under the ice
 *   audioChromaHue-> palette offset for the volcanic energy
 *
 * Per-activation variety:
 *   iceP float roughness of the icy surface (0.5..1.5)
 *   magmaP float intensity of the glowing fissures (0.5..2.0)
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

uniform float iceP;
uniform float magmaP;
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

// Ridged noise for sharp ice cracks
float ridged(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 4; i++) { 
        f += a * (1.0 - abs(noise(p) * 2.0 - 1.0)); 
        p *= 2.0; a *= 0.5; 
    }
    return f;
}

void main()
{
    float ip = (iceP > 0.01 ? iceP : 1.0);
    float mp = (magmaP > 0.01 ? magmaP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    vec3 col = vec3(0.0);
    vec3 iceColor = vec3(0.02, 0.05, 0.1); // Deep, dark, frozen blue
    vec3 magmaColor = imgPalette(0.8 + audioCentroid * 0.1); // Hot glowing fissures
    
    // Planet parameters
    vec2 planetCenter = vec2(0.0);
    float planetRad = 0.8;
    float dist = length(uv - planetCenter);
    
    // Slow rotation
    float rot = time * 0.05 + audioAdvance * 0.2;
    mat2 rotM = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    
    // Deep space background (extremely sparse/dark)
    if (dist > planetRad) {
        float bg = hash11(dot(floor(uv * 100.0), vec2(12.3, 45.6)));
        if (bg > 0.99) col += vec3(1.0) * (0.1 + audioSwell * 0.2);
        
        // Faint outgassing from the planet hitting the vacuum
        float atmos = exp(-(dist - planetRad) * 15.0);
        float gasNoise = fbm(vec3(rotM * uv * 10.0, time * 0.1));
        col += magmaColor * atmos * gasNoise * 0.2 * (0.5 + audioSwell);
    } 
    else {
        // We are on the planet surface
        // Map 2D to 3D sphere
        float z = sqrt(max(0.0, planetRad * planetRad - dist * dist));
        vec3 p3 = vec3(uv.x, uv.y, z);
        
        // Apply rotation
        p3.xz = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p3.xz;
        p3.yz = mat2(cos(0.2), -sin(0.2), sin(0.2), cos(0.2)) * p3.yz; // static tilt
        
        // Generate ice surface
        float surfaceNoise = fbm(p3 * 4.0 * ip);
        
        // Generate deep cracks/fissures (we use ridged noise inverted)
        // High values are the bottom of the cracks
        float cracks = ridged(p3 * 5.0);
        cracks = smoothstep(0.7, 0.9, cracks); // only show the deepest cuts
        
        // Add secondary smaller cracks
        float smallCracks = ridged(p3 * 15.0);
        smallCracks = smoothstep(0.8, 1.0, smallCracks) * 0.5;
        
        float totalCracks = max(cracks, smallCracks);
        
        // Magma pulsing through the cracks
        // Flowing noise inside the cracks
        float magmaFlow = fbm(vec3(p3 * 20.0 + vec3(0.0, time + audioAdvance, 0.0)));
        float magmaGlow = totalCracks * (0.2 + magmaFlow * 0.8) * mp;
        
        // Kicks cause eruptions/flashes in the magma
        float eruption = step(0.9, hash11(floor(p3.x * 5.0) + floor(time * 5.0)));
        magmaGlow *= (1.0 + eruption * audioKick * 5.0);
        
        // Subsurface scattering (ice glowing from the magma underneath)
        float subsurface = smoothstep(0.5, 0.8, ridged(p3 * 5.0)) * 0.5;
        
        // Combine surface
        vec3 surfaceCol = mix(iceColor * (0.5 + surfaceNoise * 0.5), magmaColor, magmaGlow);
        surfaceCol += magmaColor * subsurface * (0.5 + audioSwell) * mp;
        
        // Limb darkening (it's dark space, no sun, only internal light)
        float limb = smoothstep(planetRad, planetRad * 0.5, dist);
        
        col += surfaceCol * limb;
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
