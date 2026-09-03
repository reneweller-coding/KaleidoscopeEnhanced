#version 330 core
out vec4 fragColor;
/**
 * @file ExplodedViewDiagram.frag
 * @brief EXPLODED VIEW DIAGRAM: drawn as a technical illustration -- a
 * blueprint.  The paper is the photo, bleached and gridded; the model's
 * surfaces are shaded in the drawing's flat washes with ink edges where the
 * surface turns away from the eye; the parts that have flown apart carry
 * leader lines of light back toward the centre (the explosion's own
 * measure).  The bass warms the wash, the kick brightens the ink, the
 * treble adds the hatching.  Camera still.
 *
 * Audio Reactivity:
 *   audioKick  -> ink edges (light)
 *   audioBass  -> wash warmth (colour)
 *   audioHigh  -> hatching (light)
 *   audioSwell -> paper light (slow)
 *   audioLevel -> brightness
 *
 * Per-activation variety: sizeP, spreadP, hueP.
 */
uniform sampler2DArray texMeshMaterial;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float time;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;
uniform float hueP;

in vec2 vUV;
in vec3 vNormal;
in vec3 vObj;
in vec3 vPos;
in float vBg;
in float vSpread;

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

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 paperTint = mix(vec3(0.15, 0.3, 0.55), imgPalette(hue * 0.159 + 0.6), 0.35);
    float paperLight = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    if (vBg > 0.5)
    {
        // Blueprint paper: the photo bleached into the blue, with a grid.
        vec3 d = normalize(vPos);
        vec2 uv = d.xy / max(d.z, 0.25);
        vec3 photo = img(clamp(uv * 0.5 + 0.5, 0.0, 1.0));
        float g = dot(photo, vec3(0.333));
        vec3 col = paperTint * (0.5 + 0.7 * g) * paperLight;
        vec2 gr = abs(fract(uv * 6.0) - 0.5);
        float grid = smoothstep(0.02, 0.0, min(gr.x, gr.y)) * 0.25 + smoothstep(0.01, 0.0, min(abs(fract(uv * 30.0) - 0.5).x, abs(fract(uv * 30.0) - 0.5).y)) * 0.08;
        col += vec3(0.8, 0.9, 1.0) * grid * smoothstep(0.2, 0.6, d.z);
        col *= smoothstep(0.1, 0.5, d.z);
        fragColor = vec4(col, 1.0);
        return;
    }
    vec4 base = texture(texMeshMaterial, vec3(vUV, 0.0));
    vec3 n = normalize(vNormal);
    vec3 V = normalize(-vPos);
    float facing = max(dot(n, V), 0.0);
    // Flat washes: three tones by the light, in the drawing's palette.
    vec3 L = normalize(vec3(0.4, 0.8, -0.5));
    float diff = max(dot(n, L), 0.0);
    float tone = diff < 0.3 ? 0.35 : (diff < 0.7 ? 0.65 : 0.95);
    vec3 wash = mix(vec3(0.85, 0.9, 1.0), base.rgb * 1.3, 0.35) * tone;
    wash = mix(wash, wash * vec3(1.1, 0.95, 0.8), clamp(audioBass, 0.0, 1.0) * 0.4);
    // Ink edges where the surface turns away.
    float ink = 1.0 - smoothstep(0.1, 0.35, facing);
    vec3 inkCol = vec3(0.05, 0.08, 0.15);
    vec3 col = mix(wash, inkCol, ink * 0.9);
    col += imgPalette(hue * 0.159 + 0.9) * ink * audioKick * 0.8;
    // Hatching in the shadow tones, brought up by the treble.
    float hatch = pow(0.5 + 0.5 * sin((vPos.x + vPos.y) * 60.0), 10.0) * (1.0 - tone) * clamp(audioHigh * 2.0, 0.0, 1.0);
    col = mix(col, inkCol, hatch * 0.6);
    // Leader lines: the exploded parts carry a light measure of their travel.
    col += imgPalette(hue * 0.159 + 0.1) * vSpread * 0.5;
    col *= paperLight * (0.75 + 0.5 * audioLevel);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
