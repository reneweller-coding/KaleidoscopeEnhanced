#version 330 core
out vec4 fragColor;
/**
 * @file ExoplanetOcean.frag
 * @brief EXOPLANET OCEAN: A vast, undulating alien ocean under a dark sky 
 * dominated by a massive, close gas giant or moon. The water glows with 
 * strange bio-luminescence that pulses gently to the audio swells.
 *   audioAdvance -> movement of the waves and clouds
 *   audioKick    -> flashes of bio-luminescence in the wave crests
 *   audioSwell   -> ambient brightness of the sky and reflection
 *   audioChromaHue-> palette offset for the alien water and sky
 *
 * Per-activation variety:
 *   waveP float height and turbulence of the waves (0.5..1.5)
 *   moonP float size and brightness of the celestial body (0.5..2.0)
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

uniform float waveP;
uniform float moonP;
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

// Ocean wave height function
float getWaves(vec2 p, float speed) {
    float w = 0.0;
    w += sin(p.x * 2.0 + time * speed) * 0.5;
    w += sin(p.y * 3.0 + p.x * 1.5 - time * speed * 1.2) * 0.25;
    w += fbm(vec3(p * 5.0, time * speed * 0.5)) * 0.25;
    return w;
}

void main()
{
    float wp = (waveP > 0.01 ? waveP : 1.0);
    float mp = (moonP > 0.01 ? moonP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    vec3 col = vec3(0.0);
    
    vec3 waterColor = imgPalette(0.2); // Base dark water
    vec3 bioColor = imgPalette(0.7 + audioCentroid * 0.2); // Bioluminescent glow
    vec3 skyColor = imgPalette(0.1);
    vec3 moonColor = imgPalette(0.9);
    
    // Horizon line with slight bobbing
    float horizon = -0.1 + sin(time * 0.2) * 0.02 * wp;
    
    if (uv.y < horizon) {
        // Ocean surface
        float dPlane = 0.1 / abs(uv.y - horizon);
        vec2 planeUv = vec2(uv.x * dPlane, dPlane);
        
        // Forward movement
        float speed = 1.0 + audioAdvance * 2.0;
        planeUv.y -= time * 0.5 * speed;
        
        // Waves
        float w = getWaves(planeUv * wp, speed);
        
        // Normal approximation for lighting/reflection
        vec2 e = vec2(0.05, 0.0);
        float wx = getWaves((planeUv + e.xy) * wp, speed) - w;
        float wy = getWaves((planeUv + e.yx) * wp, speed) - w;
        vec3 normal = normalize(vec3(-wx, 1.0, -wy));
        
        // Reflection of the moon (light source is at y > horizon)
        vec3 lightDir = normalize(vec3(0.0, 0.5, 1.0));
        vec3 viewDir = normalize(vec3(0.0, -abs(uv.y - horizon), 1.0));
        
        float spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 32.0);
        float diffuse = max(dot(normal, lightDir), 0.0);
        
        vec3 surfaceCol = waterColor * (0.2 + diffuse * 0.8);
        surfaceCol += moonColor * spec * mp * (0.5 + audioSwell);
        
        // Bioluminescence in the wave crests (high wave peaks)
        float crests = smoothstep(0.4, 0.8, w);
        float bioFlash = crests * (0.5 + audioKick * 3.0) * wp;
        surfaceCol += bioColor * bioFlash;
        
        // Distance fog / haze fading to sky color
        float fog = exp(-dPlane * 0.1);
        col = mix(skyColor * (0.1 + audioSwell * 0.1), surfaceCol, fog);
        
    } else {
        // Sky
        // The giant moon dominates the sky
        vec2 moonPos = vec2(0.0, horizon + 0.4);
        float dMoon = length(uv - moonPos);
        float moonRad = 0.35 * mp;
        
        if (dMoon < moonRad) {
            // Moon surface
            vec2 mUv = (uv - moonPos) / moonRad;
            float mZ = sqrt(max(0.0, 1.0 - dot(mUv, mUv)));
            
            // Texture
            float mTex = fbm(vec3(mUv * 3.0, mZ + time * 0.01));
            
            // Lighting on the moon (crescent or full depending on audio Phase?)
            // We'll just make it glow
            float edgeFade = smoothstep(1.0, 0.9, length(mUv));
            col = moonColor * (0.5 + mTex * 0.5) * edgeFade * (1.0 + audioSwell);
            
            // Flash on kick (meteor impacts on the moon)
            float impacts = step(0.95, hash11(floor(mUv.x * 5.0) + floor(mUv.y * 5.0) + floor(time * 5.0)));
            col += bioColor * impacts * audioKick * 5.0 * mp;
            
        } else {
            // Sky background with stars and faint alien aurora/clouds
            float skyNoise = fbm(vec3(uv * 2.0, time * 0.05 + audioAdvance * 0.5));
            col = skyColor * skyNoise * 0.5 * (1.0 + audioSwell);
            
            // Stars
            float bg = hash11(dot(floor(uv * 150.0), vec2(12.3, 45.6)));
            if (bg > 0.98) col += vec3(1.0) * (0.2 + audioSwell * 0.2);
            
            // Moon glow/halo
            float halo = exp(-(dMoon - moonRad) * 5.0);
            col += moonColor * halo * 0.5 * mp * (1.0 + audioSwell);
        }
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
