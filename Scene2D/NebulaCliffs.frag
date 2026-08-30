#version 330 core
out vec4 fragColor;
/**
 * @file NebulaCliffs.frag
 * @brief NEBULA CLIFFS: A breathtaking flight alongside towering, light-years-high 
 * cliffs of interstellar gas and dust. The dense molecular clouds are illuminated 
 * from behind by unseen young stars, pulsing softly to the audio.
 *   audioAdvance -> camera flight speed along the cliffs
 *   audioKick    -> flashes from deep inside the dust clouds
 *   audioSwell   -> brightness of the backlighting stars
 *   audioChromaHue-> palette offset for the nebula gas
 *
 * Per-activation variety:
 *   dustP float density and thickness of the cliffs (0.5..1.5)
 *   glowP float intensity of the internal lighting (0.5..2.0)
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
uniform float glowP;
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
    float dp = (dustP > 0.01 ? dustP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 0.2 + audioAdvance * 0.5;
    
    vec3 ro = vec3(drift, 0.0, -1.0);
    
    // Look slightly sideways at the cliff
    // Staerker zur Wand gedreht: mit Blick fast parallel zur Klippe war
    // die Wolkenwand zeitweise ganz aus dem Bild (Schwarzframes).
    vec3 ta = ro + vec3(0.55, 0.15, 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.05 * sin(time * 0.1);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.0 * ww);

    vec3 col = vec3(0.0);
    
    vec3 gasColor = max(imgPalette(0.3), vec3(0.10, 0.09, 0.13)); // Outer cool gas
    vec3 coreColor = imgPalette(0.8 + audioCentroid * 0.1); // Hot inner gas
    
    // Volumetric raymarching for the nebula cliffs
    float d = 0.0;
    vec3 p;
    float densityAccum = 0.0;
    
    // The cliff face is roughly along the Z axis (Z > 0)
    for (int i = 0; i < 30; ++i) {
        p = ro + rd * d;
        
        // Base shape of the cliff
        // We use FBM to create a massive towering structure
        float shape = p.z - fbm(vec3(p.x * 0.5, p.y * 0.5, 0.0)) * 2.0;
        
        // Add detailed volumetric noise to the edge
        float detail = fbm(p * 2.0 * dp);
        float density = smoothstep(0.0, 1.0, shape + detail);
        
        if (density > 0.01) {
            float alpha = density * 0.15;
            
            // Lighting calculation
            // The light source is deep inside/behind the cloud (Z > 5)
            float depthInside = p.z - (fbm(vec3(p.x * 0.5, p.y * 0.5, 0.0)) * 2.0);
            
            // Backscattering / Rim lighting effect
            float rim = exp(-depthInside * 2.0);
            
            // Audio flashes deep inside
            // Sanftes Wetterleuchten statt 5-Hz-Plattenblitzen.
            float fh = fract(sin(floor(p.x * 2.0) * 12.9898) * 43758.5453);
            float internalFlash = pow(0.5 + 0.5 * sin(time * (0.7 + fh) + fh * 40.0), 8.0)
                                * (0.4 + audioKick * 1.6) * gp;
            
            vec3 localCol = mix(gasColor, coreColor, clamp(rim * (0.8 + 0.6 * audioSwell + internalFlash), 0.0, 1.0));
            
            col += localCol * alpha * (1.0 - densityAccum);
            densityAccum += alpha;
            
            if (densityAccum > 0.95) break;
        }
        
        d += max(0.1, abs(shape) * 0.5); // variable step size to speed up
        if (d > 10.0) break;
    }
    
    // Background space / stars
    if (densityAccum < 1.0) {
        // Runde, gejitterte Sterne -- ganze floor()-Zellen waren die
        // haesslichen Riesenpixel im Himmel.
        vec2 sgrid = uv * 50.0;
        vec2 sid = floor(sgrid);
        vec2 sf = fract(sgrid) - 0.5;
        float sh = fract(sin(dot(sid, vec2(12.9898, 78.233))) * 43758.5453);
        if (sh > 0.90) {
            vec2 spos = (vec2(fract(sh * 7.31), fract(sh * 13.7)) - 0.5) * 0.8;
            float sd2 = dot(sf - spos, sf - spos);
            float tw = 0.7 + 0.3 * sin(time * (1.0 + 2.0 * fract(sh * 29.0)) + sh * 40.0);
            col += vec3(1.0) * exp(-sd2 * 240.0) * tw * (0.5 + audioSwell * 0.4) * (1.0 - densityAccum);
        }
        
        // Very faint background nebulosity
        float bgNebula = fbm(vec3(uv * 2.0, time * 0.05));
        col += gasColor * bgNebula * 0.1 * (1.0 - densityAccum);
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
