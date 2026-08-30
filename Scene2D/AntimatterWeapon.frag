#version 330 core
out vec4 fragColor;
/**
 * @file AntimatterWeapon.frag
 * @brief ANTIMATTER WEAPON: A doomsday superweapon firing a continuous beam 
 * of pure antimatter into a target. The annihilation zone flashes violently 
 * with pure energy on audio kicks, sending ripples of destruction through space.
 *   audioAdvance -> flow of the antimatter particles in the beam
 *   audioKick    -> blinding annihilation flashes at the impact site
 *   audioSwell   -> ambient brightness of the destruction
 *   audioChromaHue-> palette offset for the exotic antimatter energy
 *
 * Per-activation variety:
 *   beamP float width and instability of the weapon beam (0.5..1.5)
 *   blastP float intensity of the impact annihilation (0.5..2.0)
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
uniform float blastP;
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
    float blast = (blastP > 0.01 ? blastP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    vec3 col = vec3(0.0);
    
    // Antimatter is exotic, maybe deep purple/magenta turning to blinding white
    vec3 amColor = imgPalette(0.7 + audioCentroid * 0.2); 
    vec3 targetColor = vec3(0.1, 0.15, 0.1); // Dark target (maybe a planet or moon)
    
    // 1. The Target (being annihilated)
    // Placed on the right side of the screen
    vec2 targetPos = vec2(0.5, 0.0);
    float dTarget = length(uv - targetPos);
    float targetRad = 0.4;
    
    if (dTarget < targetRad) {
        // Target surface
        float surface = fbm(vec3(uv * 10.0, 0.0));
        col = targetColor * (0.5 + surface * 0.5);
        
        // Annihilation spread / cracks propagating from the impact site
        float impactDist = length(uv - vec2(0.1, 0.0)); // The impact hits the left edge of the target
        float destruction = fbm(vec3(uv * 20.0, time * 0.5));
        
        // The destruction eats away the target
        float eatAway = smoothstep(0.4, 0.0, impactDist) * destruction;
        if (eatAway > 0.3) {
            // It turns into pure energy
            col = mix(col, amColor * 2.0 * (1.0 + audioSwell), smoothstep(0.3, 0.8, eatAway));
        }
        
        // Limb darkening
        col *= smoothstep(targetRad, targetRad - 0.1, dTarget);
    }
    
    // 2. The Antimatter Beam
    // Fired from off-screen left, hitting the target at x=0.1
    // The beam is a chaotic, crackling stream of exotic particles
    
    // Only draw the beam to the left of the impact site
    if (uv.x < 0.2) {
        // Distance from the central axis of the beam
        float beamAxisY = sin(uv.x * 5.0 - time * 5.0) * 0.02 * bp; // Slight wobble
        float dBeam = abs(uv.y - beamAxisY);
        
        // The beam narrows at the impact site
        float beamWidth = 0.05 * bp * (1.0 - smoothstep(-0.5, 0.1, uv.x));
        
        // Fractal noise moving extremely fast along the beam
        float stream = fbm(vec3(uv.x * 20.0 - (time * 10.0 + audioAdvance * 20.0), uv.y * 50.0, time));
        
        // Containment fields / magnetic rings holding the antimatter
        float rings = step(0.9, sin(uv.x * 50.0 + time * 5.0));
        
        // Core of the beam is pure white/bright
        float core = smoothstep(beamWidth, 0.0, dBeam) * stream;
        
        // Outer aura
        float aura = exp(-dBeam * (40.0 / bp));
        
        // Intensity spikes on audio kick
        float kickIntensity = 1.0 + audioKick * 5.0;
        
        vec3 beamRender = amColor * core * 3.0 * kickIntensity;
        beamRender += amColor * aura * (0.5 + stream * 0.5) * (1.0 + audioSwell);
        
        // Add magnetic containment rings
        beamRender += amColor * rings * aura * 2.0;
        
        col += beamRender;
    }
    
    // 3. The Annihilation Impact Zone
    // Where matter and antimatter meet at x=0.1, y=0.0
    vec2 impactPos = vec2(0.1, 0.0);
    float dImpact = length(uv - impactPos);
    
    // Massive spherical blast wave radiating from impact
    float blastWave = step(0.95, fract(dImpact * 10.0 - (time * 5.0 + audioAdvance * 5.0)));
    float blastMask = exp(-dImpact * 5.0);
    
    // Violent flashes on audio kicks
    float explosion = step(0.8, hash11(floor(time * 4.00))) * audioKick * 10.0 * blast;   // was 15 Hz
    
    // Core of the impact is completely blown out white
    float impactCore = exp(-dImpact * 20.0) * (2.0 + explosion);
    
    col += amColor * blastWave * blastMask * (1.0 + audioKick * 2.0) * blast;
    col += amColor * impactCore * blast;
    
    // Background space (stars getting distorted by gravity/energy)
    if (dTarget >= targetRad) {
        float bgDistort = dImpact;
        vec2 bgUv = uv + normalize(uv - impactPos) * (0.01 / max(bgDistort, 0.01));
        float bg = hash11(dot(floor(bgUv * 100.0), vec2(12.3, 45.6)));
        if (bg > 0.99) {
            col += vec3(1.0) * (0.2 + audioSwell * 0.2);
        }
    }
    
    // Overall glare
    col += amColor * exp(-dImpact * 3.0) * 0.3 * (1.0 + audioSwell) * blast;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
