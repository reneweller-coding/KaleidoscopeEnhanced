#version 330 core
out vec4 fragColor;
/**
 * @file VoxelizedModel.frag
 * @brief VOXELIZED MODEL: the model as a voxel sculpture of the photo.  The
 * surface is coloured per voxel cell -- one photo sample per cell, flat --
 * and lit per cell with the normal snapped to the nearest axis, with a
 * thin dark seam at the cell boundaries, so the smooth mesh reads as
 * stacked cubes.  The cell size breathes on the swell (slowly: fewer, bigger
 * voxels in the quiet, a fine sculpture at the peak), the cells glow with
 * the bass, the kick lights the seams.  Behind: the photo as a studio wall.
 *
 * Audio Reactivity:
 *   audioSwell -> voxel resolution (slow)
 *   audioBass  -> cell glow (light)
 *   audioKick  -> seam light (light)
 *   audioLevel -> brightness
 *
 * Per-activation variety: sizeP, tiltP, resP (base resolution), hueP.
 */
uniform sampler2DArray texMeshMaterial;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float time;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;
uniform float resP;
uniform float hueP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vObj;
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

float hash31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    if (vBg > 0.5)
    {
        // Studio wall: the photo soft and dim, a floor glow.
        vec3 d = normalize(vPos);
        vec2 uv = clamp(d.xy / max(d.z, 0.25) * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = img(uv) * (imgPalette(hue * 0.159 + 0.55) * 0.9 + 0.15) * smoothstep(0.2, 0.7, d.z);
        col += imgPalette(hue * 0.159 + 0.6) * 0.03;
        fragColor = vec4(col, 1.0);
        return;
    }
    // Voxel grid in object space (unit sphere): resolution breathes on the swell.
    float res = (10.0 + 14.0 * clamp(resP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 cell = floor(vObj * res);
    vec3 f = fract(vObj * res);
    // The cell's colour: one photo sample per cell (its centre projected
    // onto the picture), tinted by the palette.
    vec3 cc = (cell + 0.5) / res;                       // cell centre, -1..1
    vec2 puv = clamp(cc.xy * 0.45 + 0.5, 0.0, 1.0);
    vec3 photo = img(puv);
    vec3 col = mix(photo, photo * imgPalette(hue * 0.159 + 0.5) * 1.6, 0.3);
    col *= 0.85 + 0.3 * hash31(cell);                   // slight per-voxel variation
    // Lighting: the normal snapped to its dominant axis -> flat cube faces.
    vec3 n = normalize(vNormal);
    vec3 an = abs(n);
    vec3 snapped = (an.x > an.y && an.x > an.z) ? vec3(sign(n.x), 0.0, 0.0)
                 : (an.y > an.z) ? vec3(0.0, sign(n.y), 0.0) : vec3(0.0, 0.0, sign(n.z));
    vec3 L = normalize(vec3(0.5, 0.8, -0.6));
    float diff = max(dot(snapped, L), 0.0);
    col *= 0.35 + 0.75 * diff;
    // Seams: a thin dark line at the cell boundaries (in the two axes not
    // along the snapped normal); the kick lights them.
    vec3 e = min(f, 1.0 - f);
    e += abs(snapped);                                   // ignore the normal axis
    float seam = 1.0 - smoothstep(0.0, 0.06, min(e.x, min(e.y, e.z)));
    col = mix(col, imgPalette(hue * 0.159 + 0.9) * (0.2 + 1.5 * audioKick), seam * 0.8);
    // Bass glow from within.
    col += photo * clamp(audioBass, 0.0, 1.0) * 0.35;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
