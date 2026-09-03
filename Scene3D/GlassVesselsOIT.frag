#version 330 core
/**
 * @file GlassVesselsOIT.frag
 * @brief GLASS VESSELS: two-pass shader.  Opaque pass: the back wall (the
 * photo as a lit studio wall) and the shelf.  OIT pass: the glass -- each
 * vessel tinted by its pitch class, the photo refracted through it (the
 * wall image sampled along the refracted ray), a Fresnel reflection, a
 * specular highlight; the class that sounds fills its vessel with light
 * (the chroma as the liquid level glow), the kick sparks the highlights,
 * the treble the caustic shimmer.  Weighted-blended OIT as in
 * CathedralGlass (tone-map before accumulating).
 *
 * Audio Reactivity: audioChroma[12] -> vessel glow; audioKick -> highlights;
 *                   audioHigh -> shimmer; audioSwell -> wall light; audioLevel.
 */
layout(location = 0) out vec4 outAccum;
layout(location = 1) out vec4 outReveal;

in vec2  vTexCoord;
in vec3  vWorld;
in vec3  vNormal;
in float vKind;
in float vT;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float time;
uniform float oitPass;
uniform vec2  nearFar;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioHigh;
uniform float audioSwell;
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
    float wallLight = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    if (oitPass < 0.5)
    {
        vec3 col;
        if (vKind < -1.5)
        {
            // The shelf: dark wood with the photo as grain.
            col = img(fract(vTexCoord * vec2(6.0, 1.0))) * vec3(0.35, 0.25, 0.15) * 1.2 * wallLight;
            col *= 0.6 + 0.4 * vTexCoord.y;
        }
        else
        {
            // The wall: the photo, lit warm from the left.
            vec2 uv = vTexCoord;
            col = img(uv) * mix(vec3(1.0), imgPalette(hue * 0.159 + 0.6) * 1.5, 0.25) * wallLight * 0.8;
            col *= 0.5 + 0.7 * exp(-length(uv - vec2(0.35, 0.55)) * 1.5);
        }
        col *= 0.75 + 0.5 * audioLevel;
        outAccum  = vec4(col, interpolation);
        outReveal = vec4(0.0);
        return;
    }
    // Glass.
    int k = int(clamp(vId, 0.0, 11.0));
    float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
    vec3 n = normalize(vNormal);
    vec3 V = normalize(-vWorld);
    float c = clamp(dot(n, V), 0.0, 1.0);
    float fres = 0.04 + 0.96 * pow(1.0 - c, 4.0);
    // Refraction: the wall seen through the vessel -- sample the photo
    // along the refracted direction (the wall is far behind at z = 30).
    vec3 Rf = refract(-V, n, 1.0 / 1.45);
    vec2 wuv = clamp(vec2(0.5 + (vWorld.x + Rf.x * 20.0) * 0.012, 0.5 + (vWorld.y + Rf.y * 20.0) * 0.02), 0.0, 1.0);
    vec3 through = img(wuv) * wallLight * 0.9;
    // Tint by class; the sounding class glows as a liquid filling the vessel.
    vec3 tint = imgPalette(hue * 0.159 + float(k) / 12.0);
    vec3 glass = mix(through, through * tint * 2.2, 0.6) + tint * 0.12;
    float level = smoothstep(0.75, 0.2, vT) * e;
    glass += tint * level * 2.2;
    // Reflection of the room and a highlight.
    vec3 R = reflect(-V, n);
    vec3 refl = img(clamp(vec2(0.5 + R.x * 0.4, 0.5 + R.y * 0.4), 0.0, 1.0)) * wallLight;
    glass = mix(glass, refl, fres * 0.7);
    vec3 L = normalize(vec3(-0.5, 0.7, -0.5));
    vec3 H = normalize(L + V);
    glass += vec3(1.0) * pow(max(dot(n, H), 0.0), 80.0) * (0.6 + 1.2 * audioKick);
    // Caustic shimmer on the treble, near the foot.
    glass += tint * pow(0.5 + 0.5 * sin(vWorld.x * 8.0 + vWorld.y * 12.0 + audioAdvance * 2.0), 8.0) * smoothstep(0.5, 0.0, vT) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.5;
    vec3 col = glass * (0.8 + 0.4 * audioLevel);
    col = col / (1.0 + col * 0.22);
    float alpha = clamp(0.18 + 0.5 * fres + 0.35 * level, 0.0, 0.85);
    float zn = nearFar.x, zf = nearFar.y;
    float ndc = gl_FragCoord.z * 2.0 - 1.0;
    float z = (2.0 * zn * zf) / (zf + zn - ndc * (zf - zn));
    float w = alpha * max(1e-2, 2.5e2 * pow(1.0 - z / zf, 3.0));
    w = clamp(w, 1e-2, 2.5e2);
    outAccum  = vec4(col * alpha, alpha) * w;
    outReveal = vec4(alpha);
}
