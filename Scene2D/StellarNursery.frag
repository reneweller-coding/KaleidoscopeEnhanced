#version 330 core
out vec4 fragColor;
/**
 * @file StellarNursery.frag
 * @brief STELLAR NURSERY: A dark, dense nebula where countless protostars are 
 * igniting. They shoot highly energetic bipolar plasma jets into the gas clouds 
 * that react intensely to the music.
 *   audioAdvance -> camera flight through the nursery
 *   audioKick    -> flashes from newly ignited stars and jet pulses
 *   audioSwell   -> ambient brightness of the surrounding nebula gas
 *   audioChromaHue-> palette offset for the glowing gas
 *
 * Per-activation variety:
 *   starP float density of the protostars (0.5..1.5)
 *   jetP float intensity of the bipolar jets (0.5..2.0)
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
uniform float jetP;
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
    float sp = (starP > 0.01 ? starP : 1.0);
    float jp = (jetP > 0.01 ? jetP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 0.5 + audioAdvance * 1.5;
    
    vec3 ro = vec3(0.0, 0.0, drift);
    
    vec3 ta = ro + vec3(sin(time * 0.1) * 0.2, cos(time * 0.1) * 0.2, 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.05 * sin(time * 0.2);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.0 * ww);

    vec3 col = vec3(0.0);
    
    vec3 gasColor = max(imgPalette(0.3 + audioCentroid * 0.1), vec3(0.14, 0.10, 0.16)); // Nebulous color
    vec3 starColor = max(imgPalette(0.9), vec3(0.70, 0.62, 0.48)); // Hot newly born stars
    
    // We render this similarly to a sparse voxel field or scattered points
    // Volumetric nebula background
    float d = 0.0;
    vec3 p;
    float densityAccum = 0.0;
    
    for (int i = 0; i < 20; ++i) {
        p = ro + rd * d;
        float gasDensity = smoothstep(0.25, 0.60, fbm(p * 0.5));
        
        if (gasDensity > 0.01) {
            float alpha = gasDensity * 0.32;
            col += gasColor * alpha * (1.0 - densityAccum) * (0.5 + audioSwell);
            densityAccum += alpha;
            if (densityAccum > 0.95) break;
        }
        d += 0.5;
    }
    
    // Protostars and Jets
    // We scatter them using a grid
    for (int i = 0; i < 15; ++i) {
        float zDepth = 2.0 + float(i) * 1.5;
        vec3 st = rd * zDepth + ro;
        vec3 cell = floor(st);
        vec3 f = fract(st) - 0.5;
        
        // Probability of a protostar in this cell
        float h = hash31(cell);
        
        if (h > 1.0 - (0.05 * sp)) {
            // Star position offset within cell
            vec3 offset = hash33(cell) - 0.5;
            vec3 starPos = f - offset;
            float distToStar = length(starPos);
            
            // Random orientation for the bipolar jets
            vec3 jetDir = normalize(hash33(cell + 1.0) - 0.5);
            
            // Render the star core
            float core = exp(-distToStar * 50.0);
            
            // Flash on kick based on star's unique seed
            float kickFlash = step(0.9, hash11(h * 100.0 + floor(time * 1.25)));
            float intensity = (1.0 + kickFlash * audioKick * 5.0);
            
            col += starColor * core * intensity * (1.0 - densityAccum);
            
            // Render Bipolar Jets
            // Project the distance onto the jet axis
            float dotJet = dot(normalize(starPos), jetDir);
            float distAlongJet = abs(dotJet) * distToStar;
            float distFromJet = sqrt(max(0.0, distToStar * distToStar - distAlongJet * distAlongJet));
            
            // Jet shape: very thin, extending outwards
            if (distToStar < 1.0) {
                float jetShape = exp(-distFromJet * 100.0) * exp(-distAlongJet * 2.0);
                
                // Pulses of plasma traveling along the jet
                float pulse = step(0.8, sin(distAlongJet * 20.0 - time * 15.0 - audioAdvance * 20.0));
                
                // Color is slightly shifted from the star
                vec3 localJetCol = hueRot(starColor, 0.5 * h);
                
                col += localJetCol * jetShape * jp * (0.5 + pulse * audioKick * 3.0) * (1.0 - densityAccum);
                
                // Shockwave/Bow shock where the jet hits the gas
                float bow = smoothstep(0.8, 1.0, distAlongJet) * exp(-distFromJet * 20.0);
                col += gasColor * bow * (1.0 + audioKick * 2.0) * (1.0 - densityAccum);
            }
        }
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
