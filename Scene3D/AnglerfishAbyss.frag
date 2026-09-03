#version 330 core
out vec4 fragColor;
/**
 * @file AnglerfishAbyss.frag
 * @brief ANGLERFISH ABYSS: black water, and the only light is the fish's own
 * lure -- a small lamp that hangs in front of it and tints with the melody.
 * The body is lit by that lamp alone (plus a faint blue from far above),
 * marine snow drifts through the beam, and a drop makes the lamp flare and
 * the bioluminescent flanks pulse.  Dark, but staged: the whole scene is
 * one pool of light in the dark.  No camera motion of any kind.
 *
 * Audio Reactivity:
 *   audioMelodyPitch -> lamp colour (light)
 *   audioDrop        -> lamp flare (light)
 *   audioKick        -> flank bioluminescence pulses (light)
 *   audioSwell       -> the faint light from above (slow)
 *   audioLevel       -> lamp brightness
 */
uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float time;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioMelodyPitch;
uniform float audioDrop;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;
uniform float hueP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vPos;
in float vBg;

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

float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    // The lamp: in front of and above the fish, between it and the camera.
    vec3 lampPos = vec3(3.0, 8.0, 27.0);
    vec3 lampCol = mix(imgPalette(hue * 0.159 + 0.5), imgPalette(hue * 0.159 + 0.05), clamp(audioMelodyPitch, 0.0, 1.0));
    lampCol = mix(lampCol, vec3(0.7, 0.9, 1.0), 0.3);
    float lampPow = (0.7 + 0.6 * audioLevel) * (1.0 + 2.5 * clamp(audioDrop, 0.0, 1.0));

    if (vBg > 0.5)
    {
        // The abyss: black, a faint blue from far above on the swell, marine
        // snow drifting down (positions on the scene clock), and the lamp's
        // glow as a halo in the water.
        vec3 d = normalize(vPos);
        vec3 col = vec3(0.0, 0.01, 0.02) + vec3(0.02, 0.05, 0.09) * max(d.y, 0.0) * clamp(audioSwell, 0.0, 1.0);
        // Marine snow: ROUND flakes, jittered inside their cells, of varying
        // size -- a whole lit grid cell reads as a giant pixel (rule V8e).
        vec3 sp = d * 40.0 + vec3(0.0, sceneTime * 0.6, 0.0);
        vec3 cell = floor(sp);
        float hs = hash13(cell);
        vec3 off = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5;
        vec3 f = fract(sp) - 0.5 - off * 0.6;
        float sz = 0.06 + 0.10 * hash13(cell + 13.0);
        float flake = smoothstep(sz, sz * 0.3, length(f)) * step(0.975, hs);
        col += lampCol * flake * 0.35 * (0.4 + 0.6 * hash13(cell + 2.2));
        // Lamp halo seen against the water.
        vec3 toLamp = normalize(lampPos);
        float halo = pow(max(dot(d, toLamp), 0.0), 40.0);
        col += lampCol * halo * 0.4 * lampPow;
        fragColor = vec4(col, 1.0);
        return;
    }

    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    if (base.a < 0.1) discard;
    vec3 n = normalize(vNormal);
    vec3 toLamp = lampPos - vPos;
    float dist2 = dot(toLamp, toLamp);
    vec3 L = toLamp / sqrt(dist2);
    float diff = max(dot(n, L), 0.0) * 900.0 / (dist2 + 30.0);
    vec3 viewDir = normalize(-vPos);
    vec3 halfV = normalize(L + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), 40.0);

    float expose = materialExposure(texMeshMaterial);
    vec3 col = base.rgb * expose * lampCol * diff * lampPow;
    col += lampCol * spec * 0.4 * lampPow;
    // Faint blue from above.
    col += base.rgb * expose * vec3(0.05, 0.1, 0.18) * max(n.y, 0.0) * (0.3 + 0.7 * clamp(audioSwell, 0.0, 1.0));
    // Bioluminescent flanks pulse on the kick: photophores where the surface
    // faces sideways.
    float flank = pow(abs(n.x), 3.0);
    float dots = smoothstep(0.9, 1.0, hash13(floor(vPos * 1.5)));
    col += imgPalette(hue * 0.159 + 0.45) * flank * dots * (0.3 + 1.5 * audioKick);
    // The lamp itself, if this fragment is near it (the lure).
    float lure = exp(-length(vPos - lampPos) * 0.8);
    col += lampCol * lure * 2.0 * lampPow;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
