#version 330 core
out vec4 fragColor;
/**
 * @file MolecularCloudCore.frag
 * @brief MOLECULAR CLOUD CORE: Deep inside the dense, freezing heart of a dark 
 * molecular cloud. The eerie, slow-moving gas is pitch black, illuminated only 
 * briefly by rare hidden stars that flash violently to the audio kicks.
 *   audioAdvance -> extremely slow drift through the dense gas
 *   audioKick    -> flashes from hidden stars deep in the dust
 *   audioSwell   -> ambient, ghostly glow of the scattered light
 *   audioChromaHue-> palette offset for the eerie glow
 *
 * Per-activation variety:
 *   dustP float density and opacity of the molecular cloud (0.5..1.5)
 *   starP float intensity of the hidden star flashes (0.5..2.0)
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

uniform float dustP;
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
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 hash33(vec3 p) {
    p = vec3(dot(p,vec3(127.1,311.7, 74.7)),
             dot(p,vec3(269.5,183.3,246.1)),
             dot(p,vec3(113.5,271.9,124.6)));
    return fract(sin(p)*43758.5453123);
}

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
    float dp = (dustP > 0.01 ? dustP : 1.0);
    float sp = (starP > 0.01 ? starP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 0.1 + audioAdvance * 0.2; // very slow
    
    vec3 ro = vec3(0.0, 0.0, drift);
    vec3 rd = normalize(vec3(uv, 1.0));
    
    vec3 col = vec3(0.0);
    
    vec3 dustColor = imgPalette(0.1); // Extremely dark, barely visible
    vec3 starColor = imgPalette(0.8 + audioCentroid * 0.1); // Sudden bright flashes
    
    float d = 0.0;
    vec3 p;
    float densityAccum = 0.0;
    
    // We are inside a dense cloud, visibility is low
    // Raymarch through the dense volume
    for (int i = 0; i < 30; ++i) {
        p = ro + rd * d;
        
        // Massive slow-moving clouds
        float clouds = fbm(p * 2.0 * dp);
        
        // High density threshold
        float density = smoothstep(0.4, 0.8, clouds);
        
        if (density > 0.01) {
            float alpha = density * 0.2;
            
            // The cloud is dark, but occasionally a hidden star flashes
            // We simulate scattered light from distant hidden sources
            
            // Base ambient scattering
            vec3 localCol = dustColor * (0.16 + audioSwell * 0.18);
            
            // Random hidden star clusters flashing
            vec3 cell = floor(p * 0.5);
            float cellHash = hash11(cell.x * 12.3 + cell.y * 45.6 + cell.z * 78.9);
            
            if (cellHash > 0.55) {
                // Flash based on time and audio kick
                float flash = step(0.75, hash11(cellHash * 100.0 + floor(time * 5.0)));
                float intensity = (0.3 + flash * audioKick * 10.0) * sp;
                
                // Light scatters through the local density
                float scatter = exp(-density * 2.0);
                
                localCol += starColor * intensity * scatter * (1.0 + audioSwell);
            }
            
            col += localCol * alpha * (1.0 - densityAccum);
            densityAccum += alpha;
            
            if (densityAccum > 0.95) break;
        }
        
        d += 0.2; // small steps because it's dense
        if (d > 6.0) break; // short visibility
    }
    
    // If we look through a gap, pitch black space (no stars visible because we are in a dark cloud)
    if (densityAccum < 1.0) {
        // Just darkness
        col += vec3(0.0);
    }
    
    // Foreground fog (the gas is everywhere)
    float fgFog = fbm(vec3(uv * 5.0, drift * 2.0));
    col = mix(col, dustColor * (0.1 + audioSwell * 0.1), fgFog * 0.2 * dp);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
