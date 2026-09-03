#version 330 core
/**
 * @file SmokeRingChorus.frag
 * @brief SMOKE RING CHORUS: two-pass shader.  Opaque pass: the dark room
 * behind, the photo as a faint far wall lit by the mouths' glow.  OIT pass:
 * the rings as translucent smoke -- soft-edged (alpha falls toward the
 * tube's silhouette), thinning as they expand and age, tinted by the
 * palette, lit from the front; the onsets brighten every ring in flight,
 * the kick warms them, the treble adds a curl of light on the rims.
 * Weighted-blended OIT as in CathedralGlass (tone-map before accumulating).
 *
 * Audio Reactivity: audioOnset -> ring brightness; audioKick -> warmth;
 *                   audioHigh -> rim light; audioLevel -> brightness.
 */
layout(location = 0) out vec4 outAccum;
layout(location = 1) out vec4 outReveal;

in vec2  vTexCoord;
in vec3  vWorld;
in vec3  vNormal;
in float vKind;
in float vLife;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float oitPass;
uniform vec2  nearFar;
uniform float audioOnset;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
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

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    if (oitPass < 0.5)
    {
        // The room: the photo very dim on the far wall, a glow at the mouths.
        vec2 uv = vTexCoord;
        vec3 col = img(uv) * (imgPalette(hue * 0.159 + 0.6) * 0.6 + 0.12);
        float r = length((uv - 0.5) * vec2(1.8, 1.0));
        col += imgPalette(hue * 0.159 + 0.1) * exp(-abs(r - 0.25) * 12.0) * 0.12;
        col *= 0.75 + 0.5 * audioLevel;
        outAccum  = vec4(col, interpolation);
        outReveal = vec4(0.0);
        return;
    }
    // Smoke ring: alpha by the tube silhouette (normal facing the eye =
    // dense centre, grazing = thin edge), thinning with life.
    vec3 n = normalize(vNormal);
    vec3 V = normalize(-vWorld);
    float facing = clamp(dot(n, V), 0.0, 1.0);
    float dens = (0.55 * facing + 0.18) * (1.0 - smoothstep(0.55, 1.0, vLife)) * smoothstep(0.0, 0.08, vLife);
    float onset = clamp(audioOnset, 0.0, 1.0);
    vec3 tint = mix(vec3(0.8, 0.82, 0.85), imgPalette(hue * 0.159 + fract(vId * 0.13)), 0.45);
    tint = mix(tint, tint * vec3(1.15, 0.95, 0.8), audioKick * 0.5);
    vec3 L = normalize(vec3(0.3, 0.6, -0.7));
    float diff = 0.45 + 0.55 * max(dot(n, L), 0.0);
    vec3 col = tint * diff * (1.0 + 0.8 * onset) * (0.8 + 0.4 * audioLevel);
    // Rim light on the treble.
    float rim = pow(1.0 - facing, 3.0);
    col += imgPalette(hue * 0.159 + 0.9) * rim * (0.2 + 0.8 * clamp(audioHigh * 2.0, 0.0, 1.0));
    col = col / (1.0 + col * 0.22);
    float alpha = clamp(dens, 0.0, 0.85);
    float zn = nearFar.x, zf = nearFar.y;
    float ndc = gl_FragCoord.z * 2.0 - 1.0;
    float z = (2.0 * zn * zf) / (zf + zn - ndc * (zf - zn));
    float w = alpha * max(1e-2, 2.5e2 * pow(1.0 - z / zf, 3.0));
    w = clamp(w, 1e-2, 2.5e2);
    outAccum  = vec4(col * alpha, alpha) * w;
    outReveal = vec4(alpha);
}
