#version 330 core
out vec4 fragColor;
/**
 * @file TachyonCommRelay.frag
 * @brief TACHYON COMM RELAY: A gigantic communication relay with massive rotating
 * rings and a central data spire. Energy pulses shoot along its length,
 * synchronized with the bass drops.
 *   audioAdvance -> camera travel speed through the rings
 *   audioKick    -> data pulse flashes along the spire and rings
 *   audioSwell   -> ambient illumination of the energy field
 *   audioChromaHue-> energy color palette
 *
 * Per-activation variety:
 *   ringP float thickness/complexity of the rings (0.5..1.5)
 *   glowP float intensity of the data pulses (0.6..1.8)
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

uniform float ringP;
uniform float glowP;
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
    float rp = (ringP > 0.01 ? ringP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec3 n = normalize(vNormal);
    float isSpire = vCol.w; // 1.0 if spire, 0.0 if ring

    // Light from the central energy field
    vec3 lightDir = normalize(vec3(0.0, 0.0, vPos.z) - vPos);
    float dif = max(dot(n, lightDir), 0.0);
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));

    vec3 albedo = vec3(0.15, 0.16, 0.18); // Dark tech metal

    // Tech patterning
    vec2 uv = vec2(0.0);
    if(abs(n.x) > 0.5) uv = vPos.yz;
    else if(abs(n.y) > 0.5) uv = vPos.xz;
    else uv = vPos.xy;

    vec2 grid = floor(uv * 1.5 * rp);
    float pat = hash21(grid);
    albedo *= 0.5 + 0.5 * pat;

    vec3 col = albedo * (0.12 + dif * 1.3) * (0.7 + 0.6 * pat);
    col += albedo * fill * 0.22;

    vec3 energyColor = imgPalette(0.3 + 0.1 * audioKick);

    // Tachyon pulses
    float pulseDist = abs(vPos.z - mod(time * 50.0, 200.0));
    float pulse = exp(-pulseDist * 0.05) * audioKick * 3.0;

    // Data stream lines
    float line = step(0.9, hash21(grid + vCol.xy));
    float flow = step(0.5, fract(uv.x * 0.1 + time * 3.0));

    if (isSpire > 0.5) {
        // Core spire pulses intensely
        col += energyColor * line * flow * (1.0 + pulse * 2.0) * gp * 1.5;
        col += energyColor * pulse * 0.5 * gp;
    } else {
        // Rings emit energy inward
        col += energyColor * line * (0.5 + audioSwell) * gp;
        // Inner face of rings glows intensely
        if (dot(n, -lightDir) > 0.8) {
            col += energyColor * (1.0 + pulse) * gp;
        }
    }

    // Central energy beam (volumetric effect, faked by distance to center)
    float distToCenter = length(vPos.xy);
    float beam = exp(-distToCenter * 0.05) * (0.5 + 0.5 * audioSwell + pulse * 0.5);
    col += energyColor * beam * gp;

    // Depth fog
    float fog = clamp(vPos.z / 150.0, 0.0, 1.0);   // z ahead is positive since the wrap-sign fix
    col = mix(col, vec3(0.0), fog);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
