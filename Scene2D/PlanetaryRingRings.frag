#version 330 core
out vec4 fragColor;
/**
 * @file PlanetaryRingRings.frag
 * @brief PLANETARY RING RINGS: Complex ice rings within rings around a massive 
 * super-Saturn. The camera skims just above the ring plane. Colliding ice chunks 
 * generate sparks that react to the audio kicks.
 *   audioAdvance -> flight speed over the ring plane
 *   audioKick    -> flashes from ice chunk collisions
 *   audioSwell   -> ambient brightness of the planetary rings
 *   audioChromaHue-> palette offset for the rings
 *
 * Per-activation variety:
 *   ringP float density and complexity of the rings (0.5..1.5)
 *   sparkP float intensity of the collision sparks (0.5..2.0)
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

uniform float ringP;
uniform float sparkP;
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
    for(int i = 0; i < 4; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float rp = (ringP > 0.01 ? ringP : 1.0);
    float sp = (sparkP > 0.01 ? sparkP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // We are skimming just above the infinite plane of the rings.
    // Fake 3D perspective mapping for a plane
    vec3 col = vec3(0.0);
    vec3 ringColor = imgPalette(0.3); // Icy blue/white by default
    vec3 sparkColor = imgPalette(0.8 + audioCentroid * 0.1); // Bright sparks
    
    // Horizon is slightly below center to give downward angle
    float horizon = -0.1 + sin(time * 0.2) * 0.1; // slow pitch change
    
    if (uv.y < horizon) {
        // Project onto the ring plane
        float dPlane = 0.1 / abs(uv.y - horizon); 
        vec2 planeUv = vec2(uv.x * dPlane, dPlane);
        
        // Flight movement
        planeUv.y -= time * 0.5 + audioAdvance * 2.0;
        
        // Ring texture (radial bands in 2D perspective approximation)
        // We approximate the massive rings as straight lines that curve slightly at the edges
        float ringBands = fbm(vec3(planeUv.y * 2.0 * rp, 0.0, 0.0));
        
        // Add detailed fine rings
        ringBands += 0.5 * step(0.8, sin(planeUv.y * 50.0 * rp));
        ringBands += 0.25 * step(0.95, sin(planeUv.y * 200.0 * rp));
        
        // Gaps (Cassini divisions etc)
        float gaps = fbm(vec3(planeUv.y * 0.5, 0.0, 10.0));
        ringBands *= smoothstep(0.4, 0.6, gaps);
        
        // Clumps / ice chunks in the rings
        float chunks = fbm(vec3(planeUv * 10.0, time * 0.1));
        
        vec3 localCol = ringColor * (0.5 + ringBands * 0.5) * (0.5 + chunks * 0.5);
        
        // Collisions (Sparks)
        // When chunks collide, they flash brightly on audio kicks
        float sparkTrigger = step(0.98, hash21(floor(planeUv * 5.0) + floor(time * 5.0)));
        float sparkInt = sparkTrigger * audioKick * 5.0 * sp;
        
        localCol += sparkColor * sparkInt;
        
        // Lighting and fade to horizon
        float lighting = 0.2 + 0.8 * audioSwell;
        float fade = exp(-dPlane * 0.2); // fog/fade into distance
        
        col += localCol * lighting * fade;
    }
    else {
        // Looking up at the gas giant itself
        // The gas giant takes up a huge portion of the sky
        vec2 planetPos = vec2(0.0, horizon + 0.5);
        float dPlanet = length(uv - planetPos);
        float planetRad = 0.4;
        
        if (dPlanet < planetRad) {
            vec3 planetCol = imgPalette(0.1); // Deep gas giant color
            
            // Gas bands
            vec2 pUv = (uv - planetPos) / planetRad;
            float bands = fbm(vec3(pUv.y * 5.0, pUv.x * 2.0 - time * 0.05, 0.0));
            planetCol *= (0.5 + bands * 0.5);
            
            // Shadow from the rings cast onto the planet
            float ringShadow = smoothstep(-0.1, 0.1, pUv.y + 0.2);
            planetCol *= (0.2 + ringShadow * 0.8);
            
            // Limb darkening
            float limb = smoothstep(1.0, 0.8, length(pUv));
            col += planetCol * limb * (0.5 + audioSwell * 0.5);
        }
        else {
            // Background stars
            float bg = hash11(dot(floor(uv * 200.0), vec2(12.3, 45.6)));
            if (bg > 0.99) {
                col += vec3(1.0) * (0.2 + audioSwell * 0.2);
            }
        }
        
        // Glow from the planet
        float planetGlow = exp(-(dPlanet - planetRad) * 5.0);
        col += imgPalette(0.1) * planetGlow * 0.2 * (1.0 + audioSwell);
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
