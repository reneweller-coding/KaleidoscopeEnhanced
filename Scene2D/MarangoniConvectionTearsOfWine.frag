#version 330 core
out vec4 fragColor;
/**
 * @file MarangoniConvectionTearsOfWine.frag
 * @brief MARANGONI CONVECTION TEARS OF WINE: Solutal Marangoni effect on glass surfaces.
 * Alcohol evaporation gradients create surface tension differentials, driving climbing thin liquid
 * films, capillary rim instability beads, and cascading droplet rivulets (tears of wine).
 *   audioAdvance -> drives upward climbing film velocity & droplet rivulet cascade flow
 *   audioKick    -> flashes capillary bead pinch-off & falling droplet impacts
 *   audioSwell   -> thickens wine film meniscus depth & ruby transmission sheen
 *   audioCentroid-> shifts wine tannin/anthocyanin ruby absorption spectra
 *   audioMid     -> excites capillary wave ripples along climbing meniscus front
 *
 * Per-activation variety:
 *   tearCountP   float number of descending droplet rivulet tears (4.0..12.0)
 *   climbSpeedP  float Marangoni climbing film upward velocity   (0.6..2.2)
 *   wineSheenP   float ruby liquid film specular transmission   (0.8..2.5)
 *   meniscusP    float capillary meniscus thickness scale        (0.4..1.8)
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
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float tearCountP;
uniform float climbSpeedP;
uniform float wineSheenP;
uniform float meniscusP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Climbing film meniscus front located near y = 0.25
    float vClimb = (climbSpeedP > 0.01 ? climbSpeedP : 1.2);
    float meniscusY = 0.25 + sin(uv.x * 6.0 + t * 0.5) * 0.05;
    
    // Capillary instability bead rim at top of climbing film
    float nTears = (tearCountP > 1.0 ? tearCountP : 7.0);
    float beadPhase = uv.x * nTears * 3.14159265;
    float beads = pow(sin(beadPhase) * 0.5 + 0.5, 3.0) * exp(-abs(uv.y - meniscusY) * 20.0);
    
    // Cascading descending droplet tear rivulets below meniscus
    float tearRivulet = 0.0;
    for (float i = 0.0; i < 7.0; i += 1.0) {
        if (i >= nTears) break;
        
        float tearX = (i - (nTears - 1.0) * 0.5) * (0.8 / nTears);
        float dropY = meniscusY - fract(t * 0.8 * vClimb + i * 0.37) * 0.8;
        
        // Droplet tear profile
        float dDrop = length(vec2(uv.x - tearX, uv.y - dropY));
        float dropCore = exp(-dDrop * dDrop * 120.0);
        
        // Rivulet trail
        float inTrail = exp(-abs(uv.x - tearX) * 45.0) * smoothstep(dropY, meniscusY, uv.y) * smoothstep(-0.6, dropY, uv.y);
        tearRivulet += dropCore * 2.0 + inTrail * 0.6;
    }
    
    // Bulk wine liquid pool at bottom (y < -0.4)
    float bulkPool = smoothstep(-0.35, -0.5, uv.y);
    
    // Capillary ripples on climbing film
    float ripples = sin(uv.y * 25.0 - t * 4.0 + audioPhase) * (0.6 + 0.8 * audioMid);
    
    // Pinch-off flash on kick
    float pinchFlash = beads * (1.0 + 3.5 * audioKick) * (wineSheenP > 0.01 ? wineSheenP : 1.3);
    
    // Ruby red wine color palette
    vec3 wineRuby  = vec3(0.55, 0.04, 0.12);
    vec3 wineGlass = vec3(0.9, 0.2, 0.35);
    vec3 wineSheen = vec3(1.0, 0.95, 0.9);
    
    vec3 colWine = palTint(mix(wineRuby, wineGlass, clamp(uv.y + 0.5, 0.0, 1.0)), uv.x * 0.2 + audioCentroid, 0.26);
    
    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg;
    col += colWine * bulkPool * 1.5;
    col += colWine * tearRivulet * (0.8 + 0.4 * audioSwell) * 1.6;
    col += colWine * beads * 1.8;
    col += wineSheen * pinchFlash * 2.2;
    col += colWine * abs(ripples) * smoothstep(meniscusY, -0.4, uv.y) * 0.6;
    col += colWine * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
