#version 330 core
out vec4 fragColor;
/**
 * @file LavaWorldTidalLock.frag
 * @brief LAVA WORLD TIDAL LOCK: The day-side of a tidally locked planet. 
 * The surface is a continuous, roiling ocean of glowing magma constantly 
 * baked by a massive, close star. Eruptions and waves pulse to the beat.
 *   audioAdvance -> slow pan across the magma ocean
 *   audioKick    -> explosive magma bursts and solar flares
 *   audioSwell   -> brightness of the star and magma heat
 *   audioChromaHue-> palette offset for the magma
 *
 * Per-activation variety:
 *   lavaP float turbulence of the magma ocean (0.5..1.5)
 *   starP float intensity of the close star (0.5..2.0)
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

uniform float lavaP;
uniform float starP;
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
    float lp = (lavaP > 0.01 ? lavaP : 1.0);
    float sp = (starP > 0.01 ? starP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    
    vec3 col = vec3(0.0);
    vec3 magmaColor = imgPalette(0.8 + audioCentroid * 0.1);
    vec3 crustColor = vec3(0.05, 0.02, 0.01); // Dark solidified rock
    vec3 starColor = imgPalette(0.2); // Usually white/blue-ish for high heat
    
    // Horizon line
    float horizon = 0.0 + sin(time * 0.1) * 0.05;
    
    if (uv.y < horizon) {
        // Lava ocean surface (pseudo 3D plane projection)
        float dPlane = 0.2 / abs(uv.y - horizon);
        vec2 planeUv = vec2(uv.x * dPlane, dPlane);
        
        // Panning across the ocean
        planeUv.y -= time * 0.3 + audioAdvance;
        planeUv.x += sin(time * 0.1) * 0.5;
        
        // Lava texture
        // Low frequency for massive convection cells
        float cells = fbm(vec3(planeUv * 1.5 * lp, time * 0.1));
        
        // High frequency for flowing magma
        float flow = fbm(vec3(planeUv * 10.0, time * 0.5 + audioAdvance * 2.0));
        
        // We create crust where it's cooler
        float crustMask = smoothstep(0.4, 0.6, cells + flow * 0.2);
        
        // The exposed magma is incredibly bright
        float heat = smoothstep(0.6, 0.3, cells);
        
        // Eruptions / splashes
        float eruption = step(0.95, hash11(floor(planeUv.x * 2.0) + floor(planeUv.y * 2.0) + floor(time * 5.0)));
        float eruptionFlash = eruption * audioKick * 5.0 * lp;
        
        vec3 surfaceCol = mix(magmaColor * (heat + eruptionFlash) * 2.0, crustColor, crustMask);
        
        // Distance fade/atmospheric haze (heat shimmer)
        float haze = exp(-dPlane * 0.2);
        col = surfaceCol * haze * (0.5 + audioSwell * 0.5);
        
        // Reflection of the massive star on the magma
        float starReflection = exp(-abs(uv.x) * 10.0) * exp(-dPlane * 0.5);
        col += starColor * starReflection * sp * (1.0 + audioSwell);
        
    } else {
        // Sky / The close massive star
        // The star is huge, taking up most of the sky
        vec2 starPos = vec2(0.0, horizon + 0.3);
        float dStar = length(uv - starPos);
        float starRad = 0.6;
        
        if (dStar < starRad) {
            // Star surface
            vec2 sUv = (uv - starPos) * 5.0;
            float surface = fbm(vec3(sUv, time * 0.5 + audioAdvance));
            
            float core = smoothstep(starRad, 0.0, dStar);
            col += starColor * (0.8 + surface * 0.5) * core * sp * (1.0 + audioSwell);
            
        } else {
            // Corona and flares
            float corona = exp(-(dStar - starRad) * 10.0);
            
            // Solar flares reaching out
            float angle = atan(uv.y - starPos.y, uv.x - starPos.x);
            float flares = fbm(vec3(angle * 10.0, dStar * 5.0, time * 2.0));
            flares = smoothstep(0.6, 0.9, flares) * exp(-(dStar - starRad) * 5.0);
            
            col += starColor * corona * sp * (0.5 + audioSwell);
            col += starColor * flares * sp * (1.0 + audioKick * 3.0);
        }
        
        // Dense, burning atmosphere
        float atmos = exp(-(uv.y - horizon) * 5.0);
        col += magmaColor * atmos * 0.5 * (1.0 + audioSwell);
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
