#version 330 core
out vec4 fragColor;
/**
 * @file PillarsOfCreationFlight.frag
 * @brief PILLARS OF CREATION FLIGHT: A majestic, slow flight through colossal 
 * columns of interstellar dust and gas. Newborn stars within the pillars 
 * illuminate the dense clouds and react to the beat.
 *   audioAdvance -> flight speed through the nebula
 *   audioKick    -> flashes from newly ignited protostars
 *   audioSwell   -> ambient brightness of the dust clouds
 *   audioChromaHue-> palette offset for the nebula gas
 *
 * Per-activation variety:
 *   dustP float density and complexity of the dust pillars (0.5..1.5)
 *   starP float intensity of the newborn stars (0.5..2.0)
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
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

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
    float dp = (dustP > 0.01 ? dustP : 1.0);
    float sp = (starP > 0.01 ? starP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 0.5 + audioAdvance * 2.0;
    
    vec3 ro = vec3(0.0, 0.0, drift);
    
    // Slow, majestic camera pan
    vec3 ta = ro + vec3(sin(time * 0.1) * 0.3, cos(time * 0.15) * 0.2, 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.1 * sin(time * 0.05);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.0 * ww);

    vec3 col = vec3(0.0);
    
    vec3 dustColor1 = imgPalette(0.2 + audioCentroid * 0.1); // deep browns/reds
    vec3 dustColor2 = imgPalette(0.6 + audioCentroid * 0.2); // brighter greens/cyans
    vec3 starColor = imgPalette(0.9 + audioKick * 0.1);      // hot white/blue
    
    // Volumetric raymarching for the nebula pillars
    float d = 0.0;
    vec3 p;
    float densityAccum = 0.0;
    
    // Ambient light coming from behind the pillars
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
    
    for (int i = 0; i < 45; ++i) {
        p = ro + rd * d;
        
        // Shape of the pillars
        // Base structure: columns going roughly along Y axis
        float pillarShape = sin(p.x * 0.5) * cos(p.z * 0.3);
        pillarShape += sin(p.y * 0.2);
        
        // Add fractal detail to the edges of the pillars
        float detail = fbm(p * 0.8 * dp);
        float density = smoothstep(0.15, 0.55, pillarShape + detail * 1.5) * dp;
        
        if (density > 0.01) {
            // Self-shadowing approximation inside the cloud
            float shadow = fbm(p * 1.5 + lightDir * 0.5);
            
            vec3 localCol = mix(dustColor1, dustColor2, detail);
            
            // Lighting
            float lum = (0.45 + shadow * 1.1) * (1.0 + audioSwell);
            localCol *= lum;
            
            // Add newborn stars embedded in the dust
            float starField = hash31(floor(p * 5.0));
            if (starField > 0.98) {
                float pulse = sin(time * 5.0 + starField * 100.0) * 0.5 + 0.5;
                float kickFlash = step(0.99, hash11(floor(p.z) + floor(time * 4.00)));
                localCol += starColor * (pulse + kickFlash * audioKick * 10.0) * sp * 5.0;
            }
            
            // Accumulate
            float alpha = density * 0.35;
            col += localCol * alpha * (1.0 - densityAccum);
            densityAccum += alpha;
            
            if (densityAccum > 0.95) break;
        }
        
        // Variable step size based on density
        d += max(0.2, 0.5 - density * 0.3);
        if (d > 30.0) break;
    }
    
    // Background glow (the ionizing radiation from massive O-type stars off-camera)
    vec3 bgGlow = dustColor2 * (0.1 + audioSwell * 0.2) * smoothstep(-1.0, 1.0, rd.y);
    col += bgGlow * (1.0 - densityAccum);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
