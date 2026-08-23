#version 330 core
out vec4 fragColor;
/**
 * @file AsteroidMiningBase.frag
 * @brief ASTEROID MINING BASE: A sprawling industrial complex built into 
 * tumbling asteroids. Spotlights cut through the dust, and massive laser drills
 * flash in time with the music.
 *   audioAdvance -> flight speed through the asteroid field
 *   audioKick    -> flashes from mining lasers and warning lights
 *   audioSwell   -> dust density and ambient industrial glow
 *   audioChromaHue-> laser and light color palette
 *
 * Per-activation variety:
 *   dustP float density of the ambient dust (0.5..1.5)
 *   laserP float intensity of mining lasers (0.6..1.8)
 *   hueP float palette offset (0..6.28)
 */

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;
uniform float audioLevel;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float dustP;
uniform float laserP;
uniform float hueP;

in vec4 vCol;
in vec3 vCorner;
in vec3 vPos;
in vec3 vNormal;

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

float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float dp = (dustP > 0.01 ? dustP : 1.0);
    float lp = (laserP > 0.01 ? laserP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec3 n = normalize(vNormal);
    float isBase = vCol.w; // 1.0 if base module, 0.0 if asteroid
    
    // Light from the local star + mining floods
    vec3 sunDir = normalize(vec3(0.5, 0.8, -0.4));
    float dif = max(dot(n, sunDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
    
    vec3 col = vec3(0.0);
    
    vec3 laserColor = imgPalette(0.8 + 0.1 * audioKick);
    vec3 warnColor = imgPalette(0.1);

    if (isBase > 0.5) {
        // Tech panels
        vec3 albedo = vec3(0.2, 0.22, 0.25);
        vec2 uv = vec2(0.0);
        if(abs(n.x) > 0.5) uv = vPos.yz;
        else if(abs(n.y) > 0.5) uv = vPos.xz;
        else uv = vPos.xy;
        
        vec2 grid = floor(uv * 2.0);
        albedo *= 0.8 + 0.2 * hash21(grid);
        
        col = albedo * (0.5 + dif * 1.3);   // lifted: first-ever calibrated exposure -- the scene never rendered before the wrap-sign fix
        col += albedo * fill * 0.25;
        
        // Warning lights / windows
        float window = step(0.8, hash21(grid + vCol.xy));
        float isWall = step(0.5, 1.0 - abs(n.y));
        float blink = step(0.5, fract(time * 2.0 + vCol.x * 10.0));
        
        col += warnColor * window * isWall * (0.5 + blink * 1.5 * audioKick) * lp;
        
    } else {
        // Asteroid rock
        vec3 albedo = vec3(0.15, 0.14, 0.13);
        // fake noise
        vec3 p = vCorner * 10.0;
        float rockNoise = fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        albedo *= 0.5 + 0.5 * rockNoise;
        
        col = albedo * (0.4 + dif * 1.2);
        col += albedo * fill * 0.18;
        
        // Laser scorch marks or glowing ores
        float ore = step(0.95, rockNoise);
        col += laserColor * ore * (1.0 + 2.0 * audioKick) * lp;
    }
    
    // Distance fog (thick dust)
    float dist = length(vPos);
    float fog = exp(-abs(vPos.z) * 0.01 * dp) * (0.8 + 0.2 * audioSwell);
    vec3 fogColor = mix(vec3(0.05, 0.04, 0.03), warnColor * 0.2, 0.5);
    
    col = mix(fogColor, col, clamp(fog, 0.0, 1.0));

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
