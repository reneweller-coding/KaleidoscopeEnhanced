#version 330 core
out vec4 fragColor;
/**
 * @file DysonSphereCore.frag
 * @brief DYSON SPHERE CORE: Huge panels and spires of a megastructure surrounding
 * a central star. The geometry is built from instances, and shaded with intricate
 * tech patterns and emissive energy lines.
 *   audioAdvance -> rotation of the structure and camera travel
 *   audioKick    -> flashes from energy conduits
 *   audioSwell   -> ambient illumination and star brightness
 *   audioChromaHue-> color palette follows the musical key
 *
 * Per-activation variety:
 *   panelP float panel density/size (0.7..1.5)
 *   energyP float brightness of energy lines (0.6..1.8)
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

uniform float panelP;
uniform float energyP;
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

// Tech pattern for panels
float techPattern(vec2 uv) {
    uv *= 5.0;
    vec2 id = floor(uv);
    vec2 f = fract(uv);
    float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
    
    // Split into smaller grids
    if(h > 0.5) {
        uv *= 2.0;
        id = floor(uv);
        f = fract(uv);
        h = fract(sin(dot(id, vec2(34.12, 12.33))) * 43758.5453);
    }
    
    float edge = step(0.1, f.x) * step(f.x, 0.9) * step(0.1, f.y) * step(f.y, 0.9);
    return edge * (0.5 + 0.5 * h);
}

void main()
{
    float pp = (panelP > 0.01 ? panelP : 1.0);
    float ep = (energyP > 0.01 ? energyP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec3 n = normalize(vNormal);
    
    // Fake a central star light
    vec3 lightDir = normalize(vec3(0.0) - vPos);
    float dif = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
    
    vec3 albedo = vec3(0.2, 0.22, 0.25);
    
    // Map uv based on normal for triplanar-ish mapping
    vec2 uv = vec2(0.0);
    if(abs(n.x) > 0.5) uv = vPos.yz;
    else if(abs(n.y) > 0.5) uv = vPos.xz;
    else uv = vPos.xy;
    
    float pat = techPattern(uv * pp);
    albedo *= 0.5 + 0.5 * pat;
    
    vec3 energyColor = imgPalette(0.8 + 0.1 * audioKick);
    vec3 panelColor = imgPalette(0.2);
    
    vec3 col = albedo * (0.1 + dif * (1.0 + audioSwell)) * panelColor;
    col += albedo * fill * 0.2;
    
    // Energy lines in the cracks
    float energyLines = step(pat, 0.1) * fract(sin(vCol.w * 100.0) * 43758.5);
    energyLines *= smoothstep(0.0, 0.2, sin(uv.x * 2.0 + time * 2.0 + audioAdvance * 5.0));
    
    col += energyColor * energyLines * (1.5 + 3.0 * audioKick) * ep;
    
    // Central star glow on the panels (atmospheric/corona scattering)
    float distToCenter = length(vPos);
    float corona = exp(-distToCenter * 0.02) * (1.0 + audioSwell * 0.5);
    col += imgPalette(0.5) * corona * 0.5;

    // Fade into distance
    float dist = length(vPos);
    float fog = clamp((dist - 40.0) / 100.0, 0.0, 1.0);
    col = mix(col, vec3(0.0), fog);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
