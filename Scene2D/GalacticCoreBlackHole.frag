#version 330 core
out vec4 fragColor;
/**
 * @file GalacticCoreBlackHole.frag
 * @brief GALACTIC CORE BLACK HOLE: A fast-paced orbit around Sagittarius A* at 
 * the center of the galaxy. Extreme density of fast-moving stars zooming past, 
 * heavily distorted by the immense gravitational lensing of the black hole.
 *   audioAdvance -> camera orbital speed
 *   audioKick    -> flashes from stars being torn apart / accretion flares
 *   audioSwell   -> brightness of the dense galactic core background
 *   audioChromaHue-> palette offset for the core's light
 *
 * Per-activation variety:
 *   starP float density and speed of orbiting stars (0.5..2.0)
 *   lensP float strength of the gravitational lensing (0.5..1.5)
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

uniform float starP;
uniform float lensP;
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
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main()
{
    float sp = (starP > 0.01 ? starP : 1.0);
    float lp = (lensP > 0.01 ? lensP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    // Position of the supermassive black hole
    vec2 bhPos = vec2(0.0, 0.0);
    
    // Camera orbital motion (background rotates)
    float camRot = time * 0.2 + audioAdvance * 0.5;
    mat2 rotM = mat2(cos(camRot), -sin(camRot), sin(camRot), cos(camRot));
    
    vec2 st = uv - bhPos;
    float dist = length(st);
    
    // Gravitational Lensing effect
    // Event horizon size
    float rs = 0.15;
    
    // Lensing distortion
    float deflection = rs * rs / (dist * dist);
    deflection *= lp; // adjust lensing strength
    
    vec2 lensedSt = st * (1.0 - deflection);
    // Rotate lensed coordinates to simulate orbiting
    lensedSt = rotM * lensedSt;
    
    vec3 col = vec3(0.0);
    
    vec3 coreColor = imgPalette(0.8 + audioCentroid * 0.2); // Golden/white core
    vec3 accretionColor = imgPalette(0.3); // Orange/reddisk
    
    if (dist > rs * 0.95) { // Outside event horizon
        
        // 1. Dense background stars of the galactic core
        float bgStars = 0.0;
        for (int i = 0; i < 3; ++i) {
            float sc = 20.0 + 30.0 * float(i);
            vec2 p = lensedSt * sc;
            vec2 cell = floor(p);
            vec2 f = fract(p) - 0.5;
            
            float h = hash21(cell + float(i) * 11.0);
            if (h > 0.6) {
                float starDist = length(f);
                float intensity = exp(-starDist * (50.0 + h * 50.0));
                
                // Twinkle
                intensity *= 0.6 + 0.4 * sin(time * (2.0 + h * 4.0));
                
                bgStars += intensity * (1.0 + audioSwell * 0.5);
            }
        }
        col += coreColor * bgStars;
        
        // 2. Fast moving foreground stars in tight orbits
        // We simulate this by transforming coordinates into polar and moving them rapidly
        vec2 polar = vec2(length(lensedSt), atan(lensedSt.y, lensedSt.x));
        
        for (int j = 0; j < 15; ++j) {
            float seed = float(j);
            float orbitRadius = 0.2 + hash11(seed) * 1.5;
            // Stark verlangsamt: bis zu 35 rad/s liessen die Sterne als
            // "sehr schnelle Kreise" um das Loch peitschen.
            float speed = (0.5 + hash11(seed + 1.0) * 1.2) / orbitRadius;
            
            // Retrograde or prograde
            speed *= (hash11(seed + 2.0) > 0.5) ? 1.0 : -1.0;
            
            float angle = polar.y + time * speed * sp + audioAdvance * speed * 0.5;
            
            // Wrap angle
            float aDiff = mod(angle, 6.28318) - 3.14159;
            float rDiff = polar.x - orbitRadius;
            
            // Map back to cartesian distance for drawing
            float d2Star = length(vec2(rDiff, aDiff * polar.x));
            
            if (d2Star < 0.1) {
                float sInt = 0.001 / max(d2Star * d2Star, 0.0001);
                // Flares / tidal disruption near the black hole
                if (orbitRadius < 0.4 && hash11(floor(time * 1.2) + seed) > 0.8) {
                    sInt *= 2.0 + audioKick * 5.0; // bright flash
                }
                
                vec3 sColor = imgPalette(hash11(seed + 3.0));
                col += sColor * sInt * sp;
            }
        }
        
        // 3. Faint accretion disk glow
        float disk = exp(-(dist - rs * 1.5) * (dist - rs * 1.5) * 50.0);
        col += accretionColor * disk * (0.2 + audioSwell * 0.5);
        
        // 4. Photon ring (extremely bright thin ring just outside event horizon)
        float photonRing = smoothstep(rs * 1.05, rs, dist) * smoothstep(rs * 0.9, rs * 0.98, dist);
        col += coreColor * photonRing * (2.0 + audioKick);
        
    } else {
        // Inside event horizon (pure black)
        col = vec3(0.0);
    }
    
    // Core glow (general ambient brightness of being in the center of the galaxy)
    float coreGlow = exp(-dist * 2.0);
    col += coreColor * coreGlow * 0.2 * (1.0 + audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
