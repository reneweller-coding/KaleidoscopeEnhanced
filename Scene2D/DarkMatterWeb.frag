#version 330 core
out vec4 fragColor;
/**
 * @file DarkMatterWeb.frag
 * @brief DARK MATTER WEB: A visual representation of the cosmic web that binds 
 * the universe. Glowing filaments of dark matter connect massive galactic nodes, 
 * pulsing with dark, eerie energy to the beat.
 *   audioAdvance -> camera flight through the web
 *   audioKick    -> bright pulses travelling along the filaments
 *   audioSwell   -> brightness of the galactic nodes
 *   audioChromaHue-> palette offset for the dark matter
 *
 * Per-activation variety:
 *   webP float density of the dark matter filaments (0.5..1.5)
 *   glowP float intensity of the energy pulses (0.5..2.0)
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

uniform float webP;
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
    for(int i = 0; i < 4; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float wp = (webP > 0.01 ? webP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 2.0 + audioAdvance * 5.0;
    
    vec3 ro = vec3(4.0 * sin(time * 0.1), 4.0 * cos(time * 0.15), drift);
    vec3 ta = ro + vec3(sin(time * 0.2), cos(time * 0.2), 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.15 * sin(time * 0.1);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.5 * ww);

    float d = 0.0;
    vec3 col = vec3(0.0);
    
    vec3 webColor = imgPalette(0.3 + audioCentroid * 0.1); // dark purple/blue
    vec3 pulseColor = imgPalette(0.8 + audioKick * 0.2);   // bright cyan/white
    
    // Volumetric raymarching for the cosmic web
    for (int i = 0; i < 60; ++i) {
        vec3 p = ro + rd * d;
        
        // The cosmic web structure (intersecting noise)
        float n1 = noise(p * 0.5);
        float n2 = noise(p * 0.5 + vec3(12.3, 45.6, 78.9));
        float n3 = noise(p * 0.5 + vec3(98.7, 65.4, 32.1));
        
        // Filaments occur where noise values are close to each other
        float filament = smoothstep(0.22, 0.0, abs(n1 - n2)) * smoothstep(0.22, 0.0, abs(n2 - n3));
        filament *= wp;
        
        // Galactic nodes occur at noise intersections
        float node = smoothstep(0.6, 0.8, n1 * n2 * n3);
        
        if (filament > 0.01 || node > 0.01) {
            // Pulses traveling along the web based on z position and time
            float pulse = step(0.9, fract(p.z * 0.2 - time * 2.0 + n1 * 5.0));
            pulse *= audioKick * 3.0 * gp;
            
            // Add fractal detail to filaments
            float detail = fbm(p * 2.0);
            
            vec3 localCol = webColor * filament * (0.5 + detail * 2.0);
            localCol += pulseColor * pulse * filament;
            
            // Nodes glow brighter with swell
            localCol += pulseColor * node * (2.0 + audioSwell * 5.0);
            
            // Attenuate by distance
            float alpha = (filament * 0.32 + node * 0.5);
            col += localCol * alpha * exp(-d * 0.05);
        }
        
        d += 0.5 + d * 0.05;
        if (d > 50.0) break;
    }
    
    // Distant background web
    float bgNoise = fbm(rd * 10.0 + vec3(0.0, 0.0, time * 0.1));
    col += webColor * pow(bgNoise, 3.0) * (0.1 + audioSwell * 0.2);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
