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
float getWaves(vec2 p, float phase) {
    // phase is an INTEGRATED clock (time + audioAdvance), never time times a
    // level -- time*speed with speed jumping per frame was the reported
    // full-screen shimmer ("schnelles Flirren").
    float w = 0.0;
    w += sin(p.x * 2.0 + phase) * 0.5;
    w += sin(p.y * 3.0 + p.x * 1.5 - phase * 1.2) * 0.25;
    w += fbm(vec3(p * 5.0, phase * 0.5)) * 0.25;
    return w;
}

void main()
{
    float wp = (waveP > 0.01 ? waveP : 1.0);
    float mp = (moonP > 0.01 ? moonP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    vec3 col = vec3(0.0);
    
    vec3 waterColor = max(imgPalette(0.2), vec3(0.05, 0.07, 0.10)); // Base dark water, nie ganz schwarz
    vec3 bioColor = imgPalette(0.7 + audioCentroid * 0.2); // Bioluminescent glow
    vec3 skyColor = imgPalette(0.1);
    vec3 moonColor = imgPalette(0.9);
    
    // Horizon line with slight bobbing
    float horizon = -0.1 + sin(time * 0.2) * 0.02 * wp;
    
    if (uv.y < horizon) {
        // Ocean surface
        float dPlane = 0.1 / abs(uv.y - horizon);
        vec2 planeUv = vec2(uv.x * dPlane, dPlane);
        
        // Forward movement on an integrated clock (jump-free)
        float travel = time * 0.5 + audioAdvance * 0.8;
        planeUv.y -= travel;

        // Waves
        float w = getWaves(planeUv * wp, travel);

        // Normal approximation for lighting/reflection
        vec2 e = vec2(0.05, 0.0);
        float wx = getWaves((planeUv + e.xy) * wp, travel) - w;
        float wy = getWaves((planeUv + e.yx) * wp, travel) - w;
        vec3 normal = normalize(vec3(-wx, 1.0, -wy));
        
        // Reflection of the moon (light source is at y > horizon)
        vec3 lightDir = normalize(vec3(0.0, 0.5, 1.0));
        vec3 viewDir = normalize(vec3(0.0, -abs(uv.y - horizon), 1.0));
        
        float spec = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 32.0);
        float diffuse = max(dot(normal, lightDir), 0.0);
        
        vec3 surfaceCol = waterColor * (0.28 + diffuse * 0.9);
        // Moon glitter path: the sparkling light road under the moon is what
        // makes a night sea READ as water.
        float glitter = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 90.0)
                      * exp(-abs(uv.x) * 2.2);
        surfaceCol += max(moonColor, vec3(0.35, 0.33, 0.30))
                    * (spec * 0.5 + glitter * 2.2) * mp * (0.6 + audioSwell);
        
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
            
            // Moon with a real terminator, and a brightness FLOOR: the pure
            // palette colour went black on dark photos -- the giant moon was
            // an invisible hole in the sky.
            vec3 mCol = max(moonColor, vec3(0.38, 0.36, 0.32));
            vec3 mN = normalize(vec3(mUv, mZ));
            vec3 mSun = normalize(vec3(0.55, 0.25, 0.55));
            float mShade = 0.32 + 0.68 * max(dot(mN, mSun), 0.0);
            float edgeFade = smoothstep(1.0, 0.92, length(mUv));
            col = mCol * (0.55 + mTex * 0.45) * mShade * edgeFade * (1.0 + 0.4 * audioSwell);
            
        } else {
            // Sky background with stars and faint alien aurora/clouds
            float skyNoise = fbm(vec3(uv * 2.0, time * 0.05 + audioAdvance * 0.5));
            col = skyColor * skyNoise * 0.5 * (1.0 + audioSwell);
            
            // Stars -- round, jittered points (whole floor() cells were the
            // square pixels).
            vec2 sgrid = uv * 60.0;
            vec2 sid = floor(sgrid);
            vec2 sf = fract(sgrid) - 0.5;
            float sh = fract(sin(dot(sid, vec2(12.9898, 78.233))) * 43758.5453);
            if (sh > 0.90) {
                vec2 spos = (vec2(fract(sh * 7.31), fract(sh * 13.7)) - 0.5) * 0.8;
                float sd2 = dot(sf - spos, sf - spos);
                float tw = 0.7 + 0.3 * sin(time * (1.0 + 2.0 * fract(sh * 29.0)) + sh * 40.0);
                col += vec3(1.0) * exp(-sd2 * 260.0) * tw * (0.5 + audioSwell * 0.4);
            }
            
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
