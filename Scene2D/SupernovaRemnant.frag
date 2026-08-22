#version 330 core
out vec4 fragColor;
/**
 * @file SupernovaRemnant.frag
 * @brief SUPERNOVA REMNANT: A beautiful, chaotic expanding shell of colorful 
 * ionized gas from a recent stellar explosion. The gas filaments ripple and 
 * pulse intensely to the music.
 *   audioAdvance -> slow expansion / flight through the gas
 *   audioKick    -> shockwaves propagating through the nebula
 *   audioSwell   -> brightness of the ionized gas
 *   audioChromaHue-> palette offset for the colorful gas layers
 *
 * Per-activation variety:
 *   gasP float complexity of the gas filaments (0.5..1.5)
 *   shockP float intensity of the shockwaves (0.5..2.0)
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

uniform float gasP;
uniform float shockP;
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
    float gp = (gasP > 0.01 ? gasP : 1.0);
    float sp = (shockP > 0.01 ? shockP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 0.5 + audioAdvance * 2.0;
    
    vec3 ro = vec3(0.0, 0.0, drift);
    
    // Slow camera panning across the remnant
    vec3 ta = ro + vec3(sin(time * 0.1) * 0.5, cos(time * 0.15) * 0.3, 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.2 * sin(time * 0.05);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.0 * ww);

    vec3 col = vec3(0.0);
    
    // Core remnant (pulsar or black hole) off in the distance
    vec3 coreColor = imgPalette(0.9 + audioCentroid * 0.1);
    
    // Outer expanding gas shells
    vec3 gasColor1 = imgPalette(0.2); // Outer cool gas
    vec3 gasColor2 = imgPalette(0.6); // Inner hot gas
    
    float d = 0.0;
    float densityAccum = 0.0;
    vec3 p;
    
    // We render this as a thick volumetric shell
    for (int i = 0; i < 50; ++i) {
        p = ro + rd * d;
        
        // Simulating an expanding spherical shell structure with turbulence
        // We offset the center far ahead
        vec3 center = vec3(0.0, 0.0, drift + 15.0);
        float distToCenter = length(p - center);
        
        // Base shell structure (thick region between r=5 and r=10)
        float shell = smoothstep(12.0, 8.0, distToCenter) * smoothstep(4.0, 8.0, distToCenter);
        
        if (shell > 0.01) {
            // Chaotic filaments inside the shell
            float detail = fbm(p * 0.5 * gp - vec3(time * 0.2));
            float filament = smoothstep(0.2, 0.6, detail);
            
            float density = shell * filament * gp;
            
            if (density > 0.01) {
                // Color gradient based on distance from center (cooler outside, hotter inside)
                float temp = smoothstep(12.0, 4.0, distToCenter);
                vec3 localCol = mix(gasColor1, gasColor2, temp);
                
                // Shockwaves propagating outward
                // We use distance from center and time/audio to create rippling spheres
                float shock = step(0.95, fract(distToCenter * 2.0 - time * 5.0 - audioPhase));
                shock *= audioKick * 3.0 * sp;
                
                localCol += coreColor * shock;
                
                // Illumination from the central remnant
                float lum = (1.0 / (distToCenter * 0.2 + 1.0)) * (1.0 + audioSwell * 2.0);
                localCol *= lum;
                
                float alpha = density * 0.40;
                col += localCol * alpha * (1.0 - densityAccum);
                densityAccum += alpha;
                
                if (densityAccum > 0.95) break;
            }
        }
        
        // Step size can be larger outside the shell
        float stepSize = max(0.2, abs(distToCenter - 8.0) * 0.1);
        d += stepSize;
        if (d > 40.0) break;
    }
    
    // The central remnant object (tiny but intensely bright)
    vec3 centerDir = normalize(vec3(0.0, 0.0, drift + 15.0) - ro);
    float dotC = dot(rd, centerDir);
    if (dotC > 0.999) {
        float coreInt = pow(max(0.0, dotC), 10000.0) * 10.0;
        col += coreColor * coreInt * (1.0 + audioKick) * (1.0 - densityAccum);
    }
    
    // Background starfield
    vec3 bgCol = vec3(0.0);
    for (int i = 0; i < 2; ++i) {
        float sc = 50.0 + 50.0 * float(i);
        vec3 st = rd * sc;
        vec3 cell = floor(st);
        vec3 f = fract(st) - 0.5;
        if (hash11(dot(cell, vec3(12.3, 45.6, 78.9))) > 0.98) {
            bgCol += vec3(1.0) * exp(-length(f) * length(f) * 400.0) * (0.2 + hash11(cell.x) * 0.8);
        }
    }
    col += bgCol * (1.0 - densityAccum) * (0.5 + audioSwell * 0.5);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
