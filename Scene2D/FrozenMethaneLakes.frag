#version 330 core
out vec4 fragColor;
/**
 * @file FrozenMethaneLakes.frag
 * @brief FROZEN METHANE LAKES: The surface of an icy moon (like Titan). 
 * Still, alien lakes of liquid methane reflect the colossal, ringed gas giant 
 * hanging in the sky. Gentle alien winds and distant ring-glints pulse to the audio.
 *   audioAdvance -> gentle panning across the landscape
 *   audioKick    -> flashes from meteor impacts on the rings
 *   audioSwell   -> ambient brightness of the rings and reflection
 *   audioChromaHue-> palette offset for the icy landscape
 *
 * Per-activation variety:
 *   iceP float ruggedness of the icy terrain (0.5..1.5)
 *   ringP float brightness and size of the planetary rings (0.5..2.0)
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
uniform float ringP;
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
    float ip = (iceP > 0.01 ? iceP : 1.0);
    float rp = (ringP > 0.01 ? ringP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    vec3 col = vec3(0.0);
    
    vec3 iceColor = vec3(0.1, 0.15, 0.2); // Cold, dark ice
    vec3 methaneColor = imgPalette(0.3); // Opaque, dark liquid
    vec3 skyColor = vec3(0.02, 0.05, 0.1); // Hazy atmosphere
    vec3 ringColor = imgPalette(0.8 + audioCentroid * 0.1); // Bright icy rings
    
    float drift = time * 0.2 + audioAdvance * 0.5;
    
    // Horizon line
    float horizon = -0.1;
    
    // 1. The Sky (Gas giant and rings)
    vec3 skyRender = vec3(0.0);
    
    // We render the sky first so we can reflect it
    vec2 skyUv = uv;
    // For reflection later, we will flip uv.y
    
    // Function to render the sky
    // We define it inline since we need it twice (direct and reflection)
    
    // Let's create a sky mask based on uv.y
    if (uv.y > horizon) {
        // Direct sky
        skyUv = uv;
    } else {
        // Reflected sky (distorted by calm ripples)
        float dPlane = 0.1 / abs(uv.y - horizon);
        vec2 planeUv = vec2(uv.x * dPlane + drift, dPlane - drift);
        
        // Very slow, viscous ripples (methane is cold and dense)
        float ripples = fbm(vec3(planeUv * 2.0, time * 0.1)) * 0.02;
        
        skyUv = vec2(uv.x + ripples, 2.0 * horizon - uv.y + ripples);
    }
    
    // Draw the Gas Giant
    vec2 planetPos = vec2(0.3, horizon + 0.3);
    float dPlanet = length(skyUv - planetPos);
    float planetRad = 0.4 * rp;
    
    if (dPlanet < planetRad) {
        // Planet surface (bands)
        float bands = sin((skyUv.y - planetPos.y) * 30.0 + fbm(vec3(skyUv * 5.0, time * 0.01)) * 2.0);
        skyRender = mix(iceColor, ringColor * 0.5, smoothstep(-1.0, 1.0, bands));
        
        // Edge shadow
        skyRender *= smoothstep(planetRad, planetRad * 0.8, dPlanet);
    } else {
        // Atmospheric haze
        skyRender = skyColor * (0.2 + audioSwell * 0.2);
    }
    
    // Draw the majestic rings
    // The rings are an ellipse intersecting the planet
    vec2 ringCenter = planetPos;
    // Tilt the rings
    mat2 ringRot = mat2(cos(0.3), -sin(0.3), sin(0.3), cos(0.3));
    vec2 ruv = ringRot * (skyUv - ringCenter);
    
    // Ellipse distance approximation
    float dRing = length(vec2(ruv.x, ruv.y * 5.0)); // stretched Y
    
    if (dRing > 0.4 * rp && dRing < 0.8 * rp) {
        // We are in the ring plane
        // Determine if we are in front of or behind the planet
        // ruv.y > 0 means the back half, ruv.y < 0 means front half
        bool isFront = ruv.y < 0.0;
        
        if (isFront || dPlanet > planetRad) {
            // Ring texture (radial noise)
            float ringTex = fbm(vec3(dRing * 20.0, 0.0, 0.0));
            
            // Mask out gaps in the rings
            float gaps = sin(dRing * 100.0) * sin(dRing * 50.0);
            
            if (gaps > 0.0) {
                // Flash on kick (meteor impacts in the rings)
                float ringFlash = step(0.95, hash11(floor(ruv.x * 10.0) + floor(time * 1.25))) * audioKick * 3.0 * rp;
                
                vec3 localRingCol = ringColor * (0.5 + ringTex * 0.5) * (1.0 + audioSwell) * gaps;
                localRingCol += ringColor * ringFlash;
                
                // Additive blend for rings
                skyRender += localRingCol;
            }
        }
    }
    
    // 2. The Landscape (Ice and Methane Lakes)
    if (uv.y < horizon) {
        float dPlane = 0.1 / abs(uv.y - horizon);
        vec2 planeUv = vec2(uv.x * dPlane + drift, dPlane - drift);
        
        // Terrain height (Islands of ice vs lakes)
        float terrain = fbm(vec3(planeUv * 2.0, 0.0));
        
        // Smooth threshold to separate land and liquid
        float shore = smoothstep(0.4, 0.5, terrain);
        
        // Ice land
        vec3 landCol = iceColor * (0.5 + fbm(vec3(planeUv * 10.0, 0.0)) * 0.5) * ip;
        
        // Methane lake (reflects the sky)
        // Methane is dark, so reflection is prominent
        vec3 lakeCol = mix(methaneColor * 0.2, skyRender, 0.8);
        
        // Combine land and lake
        vec3 surfaceCol = mix(lakeCol, landCol, shore);
        
        // Distance fog / haze (thick atmosphere)
        float fog = exp(-dPlane * 0.5);
        col = mix(skyColor, surfaceCol, fog);
        
    } else {
        // We look at the sky
        col = skyRender;
    }
    
    // Overall atmospheric haze
    col += skyColor * 0.1 * (1.0 + audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
