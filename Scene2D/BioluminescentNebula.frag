#version 330 core
out vec4 fragColor;
/**
 * @file BioluminescentNebula.frag
 * @brief BIOLUMINESCENT NEBULA: Massive, fluid-like clouds of interstellar gas
 * that glow with organic, bioluminescent colors. The nebula ripples and pulses
 * like a living organism in response to the audio.
 *   audioAdvance -> drift speed through the nebula
 *   audioKick    -> flashes of bright light through the gas clouds
 *   audioSwell   -> overall glow intensity and color shifting
 *   audioPhase   -> rotation of the viewing angle
 *   audioChromaHue-> base color palette of the nebula
 *
 * Per-activation variety:
 *   densP float density of the nebula clouds (0.5..1.5)
 *   glowP float intensity of the bioluminescence (0.6..1.8)
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

uniform float densP;
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
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.03; a *= 0.5; }
    return f;
}

void main()
{
    float dp = (densP > 0.01 ? densP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.1 + audioAdvance * 0.2;
    float drift = time * 2.0 + audioAdvance * 5.0;
    
    vec3 ro = vec3(3.0 * sin(t), 3.0 * cos(t * 0.8), drift);
    vec3 ta = ro + vec3(sin(t * 0.5), cos(t * 0.3), 1.0);
    
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    
    float roll = 0.2 * sin(t * 0.2) + audioPhase * 0.2;
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.5 * ww);

    float d = 0.0;
    vec3 col = vec3(0.0);
    
    vec3 colorBase1 = imgPalette(0.1 + audioCentroid * 0.2);
    vec3 colorBase2 = imgPalette(0.8 + audioKick * 0.1);
    
    // Volumetric raymarching for the nebula
    for (int i = 0; i < 60; ++i) {
        vec3 p = ro + rd * d;
        
        // Distort space slightly for organic feel
        vec3 warp = vec3(fbm(p * 0.1), fbm(p * 0.1 + 10.0), fbm(p * 0.1 + 20.0));
        vec3 np = p * 0.5 + warp * 2.0 * audioSwell;
        
        float dens = fbm(np);
        
        // Carve out empty space
        dens = smoothstep(0.3, 0.8, dens) * dp;
        
        if (dens > 0.01) {
            // Pulse based on audio kick
            float pulse = step(0.9, fract(dens * 10.0 - time * 2.0));
            pulse *= audioKick * 2.0;
            
            // Color mapping based on density
            vec3 localCol = mix(colorBase1, colorBase2, dens);
            localCol *= (0.2 + audioSwell * 0.8 + pulse) * gp;
            
            // Fade by distance
            float alpha = dens * 0.1;
            col += localCol * alpha * exp(-d * 0.05);
        }
        
        d += 0.5 + d * 0.02;
        if (d > 50.0) break;
    }
    
    // Add glowing spores / stars
    vec3 sporeCol = vec3(0.0);
    for (int i = 0; i < 2; ++i) {
        float sc = 10.0 + 10.0 * float(i);
        vec3 st = rd * sc + vec3(0.0, 0.0, drift * 0.1);
        vec3 cell = floor(st);
        vec3 f = fract(st) - 0.5;
        if (hash11(dot(cell, vec3(12.3, 45.6, 78.9))) > 0.95) {
            float b = exp(-length(f) * 200.0);
            sporeCol += mix(colorBase2, vec3(1.0), hash11(cell.x)) * b * (1.0 + audioKick * 3.0) * gp;
        }
    }
    col += sporeCol;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
