#version 330 core
out vec4 fragColor;
/**
 * @file TessellatedLavaLake.frag
 * @brief TESSELLATED LAVA LAKE: dark crust plates drifting on a lake of
 * melt; between the plates the lava glows, and the glow is the music --
 * the bass pushes the orange-white up through the seams, the kick flares
 * them, the swell heaves the whole surface (evaluation stage).  The crust
 * carries the photo as its scorched texture; the sky above is night with
 * the lake's own glow on the smoke.  Camera height fixed on the shore.
 *
 * Audio Reactivity:
 *   audioBass  -> seam glow (light)
 *   audioKick  -> seam flare (light)
 *   audioSwell -> heave (evaluation stage, slow)
 *   audioLevel -> brightness
 *
 * Per-activation variety: camHP, detailP, plateP, hueP.
 */
in vec3  vWorld;
in vec2  vSurfUV;
in vec3  vNormal;
in float vSeam;
in float vPlate;
in float vDist;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioKick;
uniform float audioBass;
uniform float audioChromaHue;
uniform float audioValence;
uniform float camHP;
uniform float hueP;

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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vec3(0.0, camHP, 0.0) - vWorld);
    float bass = clamp(audioBass, 0.0, 1.0);

    // Crust: dark basalt with the photo scorched into it, per plate offset.
    vec2 cuv = fract(vWorld.xz * 0.02 + vPlate * 0.37);
    vec3 photo = img(cuv);
    vec3 crust = mix(vec3(0.12, 0.1, 0.1), photo * 0.5, 0.5);
    crust *= 0.6 + 0.4 * hash21(floor(vWorld.xz * 0.8));
    vec3 L = normalize(vec3(0.3, 0.6, -0.4));
    float diff = max(dot(n, L), 0.0);
    crust *= 0.4 + 0.8 * diff;
    // The melt in the seams: orange-white, brighter with the bass, flaring
    // on the kick; the seam width grows a little with the bass (light only).
    float seamGlow = 1.0 - smoothstep(0.0, 0.12 + 0.08 * bass, vSeam);
    vec3 melt = mix(vec3(1.0, 0.45, 0.08), imgPalette(hue * 0.159 + 0.05), 0.3);
    vec3 hot = mix(melt, vec3(1.0, 0.9, 0.6), bass * 0.6);
    float pulse = 0.8 + 0.6 * bass + 1.2 * audioKick;
    vec3 col = mix(crust, hot * pulse * 1.6, seamGlow);
    // The glow bleeds onto the plate edges.
    float bleed = exp(-vSeam * 6.0) * (0.3 + 0.7 * bass);
    col += melt * bleed * 0.5;
    // Heat shimmer speckle: round sparks rising from the seams (light).
    vec2 su = (vWorld.xz + vec2(0.0, -sceneAdvance * 3.0)) * 0.8; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    float spark = smoothstep(0.18, 0.05, length(sf - so * 0.6)) * step(0.96, hash21(sc)) * seamGlow;
    col += vec3(1.0, 0.8, 0.5) * spark * 2.0;
    // Distance: the far lake dims into smoke lit from below.
    float fog = 1.0 - exp(-vDist * 0.005);
    vec3 smoke = mix(vec3(0.12, 0.05, 0.03), melt * 0.25, bass * 0.5);
    col = mix(col, smoke, clamp(fog, 0.0, 0.9));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
