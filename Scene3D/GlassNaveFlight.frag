#version 330 core
/**
 * @file GlassNaveFlight.frag
 * @brief Fragment stage for GlassNaveFlight: stone (pillars, floor) and sky
 * in the opaque pass, backlit glass panes in the weighted-blended OIT pass.
 * Each pane's glow is its spectrum band; the sun's height and colour come
 * from the host day clock; the floor takes the coloured light of the panes
 * as a soft wash.  Declares oitPass, so the host runs the transparent pass.
 *
 * Audio Reactivity: audioSpectrum[32] -> pane glow (light); audioKick ->
 *   stone rim flash; audioLevel -> overall; dayPhase -> sun.
 */
layout(location = 0) out vec4 outAccum;
layout(location = 1) out vec4 outReveal;

in vec3  vPos;
in vec3  vNormal;
in vec2  vTexCoord;
in float vBand;
in float vKind;
in float vFace;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float oitPass;
uniform vec2  nearFar;
uniform float time;
uniform float dayPhase;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
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
    // The sun: height from the day clock (continuous through the wrap).
    float dp = dayPhase * 6.2831853;
    vec3 sunDir = normalize(vec3(0.5 * cos(dp), 0.35 + 0.5 * sin(dp), 0.7));
    float sunUp = clamp(sunDir.y, 0.0, 1.0);
    vec3 sunCol = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.97, 0.9), sunUp);

    if (oitPass < 0.5)
    {
        vec3 col;
        if (vKind > 1.5)
        {
            // Sky at the end of the nave: the photo as a distant window, the
            // sun as a glow.
            vec2 uv = vTexCoord;
            col = img(uv) * 0.5 * sunCol + sunCol * exp(-length(uv - vec2(0.5 + 0.3 * cos(dp), 0.55 + 0.25 * sin(dp))) * 6.0) * 0.8;
        }
        else
        {
            vec3 n = normalize(vNormal);
            float sun = max(dot(n, sunDir), 0.0);
            vec3 stone = vec3(0.55, 0.52, 0.48) * (0.15 + 0.6 * sun * sunUp);
            // The glass throws its coloured light onto the stone: a wash
            // from the pane beside this bay.
            int band = int(clamp(vBand, 0.0, 31.0));
            float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
            vec3 wash = imgPalette(hue * 0.159 + vBand / 32.0) * (0.15 + 0.6 * e);
            col = stone + wash * 0.5 * (0.5 + 0.5 * sunUp);
            col *= 0.7 + 0.5 * audioLevel;
            // Floor detail: the photo as inlay, faint.
            if (vFace > 1.5 && vFace < 2.5) col += img(fract(vTexCoord * vec2(2.0, 12.0))) * 0.08;
            col += vec3(0.6, 0.55, 0.5) * audioKick * 0.15;
            // Fog with distance, the colour of the sun.
            float fog = 1.0 - exp(-vPos.z * 0.02);
            col = mix(col, sunCol * 0.15, clamp(fog, 0.0, 0.8));
        }
        vec3 t = max(col, 0.0);
        t /= 1.0 + 0.35 * max(t.r, max(t.g, t.b));
        outAccum  = vec4(clamp(t, 0.0, 1.0), 1.0);
        outReveal = vec4(0.0);
        return;
    }

    // ---- glass pane (OIT) ----
    int band = int(clamp(vBand, 0.0, 31.0));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    vec3 paneCol = imgPalette(hue * 0.159 + vBand / 32.0);
    // Tracery: lead lines on the pane.
    vec2 g = fract(vTexCoord * vec2(3.0, 5.0));
    float lead = 1.0 - smoothstep(0.0, 0.04, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
    // Backlit: emissive by the sun behind it and the band's energy.
    vec3 col = paneCol * (0.25 + 0.9 * sunUp) * (0.4 + 1.2 * e) * (0.8 + 0.4 * audioSwell);
    col += img(vTexCoord) * paneCol * 0.4;
    col = mix(col, vec3(0.05), lead);
    col = col / (1.0 + col * 0.22);
    float alpha = mix(0.45, 0.9, lead);

    float zn = nearFar.x, zf = nearFar.y;
    float ndc = gl_FragCoord.z * 2.0 - 1.0;
    float z = (2.0 * zn * zf) / (zf + zn - ndc * (zf - zn));
    float w = alpha * max(1e-2, 2.5e2 * pow(1.0 - z / zf, 3.0));
    w = clamp(w, 1e-2, 2.5e2);
    outAccum  = vec4(col * alpha, alpha) * w;
    outReveal = vec4(alpha);
}
