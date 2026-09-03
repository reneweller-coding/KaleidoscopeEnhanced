#version 330 core
out vec4 fragColor;
/**
 * @file EuropaChaosTerrain.frag
 * @brief EUROPA CHAOS TERRAIN: blue-white ice rafts in a matrix of rubble
 * ice, the rust-red lineae along the raft edges, and -- the reason to be
 * here -- the ocean beneath, whose light wells up through the seams with
 * the sub-bass.  Low sunlight (the swell) rakes across the rafts; the
 * kick sparks frost on the ridges; the photo is the ice texture.  Camera
 * height fixed.
 *
 * Audio Reactivity:
 *   audioSubBass -> ocean light through the seams (light)
 *   audioSwell   -> sunlight (slow)
 *   audioKick    -> frost sparkle (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: camHP, detailP, raftP, hueP.
 */
in vec3  vWorld;
in vec2  vSurfUV;
in vec3  vNormal;
in float vSeam;
in float vRaft;
in float vDist;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioSwell;
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
    float sun = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float sub = clamp(audioSubBass, 0.0, 1.0);

    // Ice: the photo as the crust texture, cold and pale.
    vec2 iuv = fract(vWorld.xz * 0.015 + vRaft * 0.41);
    vec3 photo = img(iuv);
    vec3 ice = mix(vec3(0.7, 0.8, 0.9), photo * 1.3, 0.35);
    ice = mix(ice, ice * imgPalette(hue * 0.159 + 0.6) * 1.5, 0.2);
    // Low sun from the side.
    vec3 L = normalize(vec3(-0.7, 0.35, 0.3));
    float diff = max(dot(n, L), 0.0);
    vec3 col = ice * (0.3 + 0.9 * diff * sun);
    // Rubble matrix between the rafts is darker and rougher.
    float matrixIce = 1.0 - smoothstep(0.0, 0.18, vSeam);
    col *= 1.0 - 0.35 * matrixIce;
    // Lineae: rust-red bands along the raft edges (salts).
    float linea = smoothstep(0.06, 0.0, abs(vSeam - 0.12));
    col = mix(col, vec3(0.5, 0.25, 0.12) * (0.5 + 0.5 * sun), linea * 0.5);
    // The ocean light through the seams: blue, welling with the sub-bass.
    float crack = 1.0 - smoothstep(0.0, 0.07, vSeam);
    vec3 ocean = mix(vec3(0.2, 0.55, 1.0), imgPalette(hue * 0.159 + 0.55), 0.3);
    col += ocean * crack * (0.7 + 0.8 * sub);
    col += ocean * exp(-vSeam * 8.0) * (0.1 + 0.2 * sub);
    // Frost sparkle on the kick: round glints.
    vec2 gu = vWorld.xz * 1.5; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float glint = smoothstep(0.2, 0.05, length(gf - go * 0.6)) * step(0.9, hash21(gc));
    col += vec3(1.0) * glint * (0.15 + 0.9 * audioKick) * diff;
    // Distance: the far plains fade into the thin haze and the black sky.
    float fog = 1.0 - exp(-vDist * 0.006);
    col = mix(col, vec3(0.02, 0.03, 0.06) + ocean * 0.04 * sub, clamp(fog, 0.0, 0.85));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
