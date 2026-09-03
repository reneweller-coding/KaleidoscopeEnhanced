#version 330 core
out vec4 fragColor;
/**
 * @file SporeReleaseGills.frag
 * @brief SPORE RELEASE GILLS: a mushroom cap from below, filling the
 * frame -- the gills radiating from the stem, and the spores (round)
 * drifting down out of them on the scene clock in slow curtains, lit from
 * the side by the treble.  The cap is the photo; the gills glow faintly
 * with their spectrum band (a gill per band around the circle); the
 * bass is the damp warmth of the forest floor light from below; the kick
 * a puff releases a denser cloud (as light on the spores).  Camera fixed
 * under the cap.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> spore drift (continuous)
 *   audioSpectrum[32] -> gill glow by band (light)
 *   audioHigh         -> spore side-light (light)
 *   audioBass         -> floor light (light)
 *   audioKick         -> puff brightness (light)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: gillsP, sporeP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioHigh;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float gillsP;
uniform float sporeP;
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
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float gills = floor(48.0 + 48.0 * clamp(gillsP, 0.0, 1.0));      // once per activation
    float sporeAmt = 0.5 + 0.5 * clamp(sporeP, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;
    vec2 centre = vec2(0.0, 0.55);                                    // the stem meets the cap above the frame top
    vec2 q = p - centre;
    float r = length(q);
    float a = atan(q.y, q.x);

    // The forest floor light from below (the bass), dark green.
    vec3 col = mix(vec3(0.03, 0.05, 0.02), imgPalette(hue * 0.159 + 0.3) * 0.15, 0.4);
    col += vec3(0.3, 0.4, 0.15) * exp(-(p.y + 0.5) * 3.0) * (0.3 + 0.9 * clamp(audioBass, 0.0, 1.0)) * 0.5;
    // The cap: the underside, cream with the photo as its tint, gills as
    // radial ridges from the centre; each gill lit by its band.
    float capR = 1.15;
    float underCap = smoothstep(capR, capR - 0.02, r);
    float gillIdx = floor((a + 3.14159) / 6.2831853 * gills);
    float gillF = fract((a + 3.14159) / 6.2831853 * gills) - 0.5;
    int band = int(mod(gillIdx, 32.0));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    float ridge = smoothstep(0.5, 0.0, abs(gillF));
    vec3 cream = mix(vec3(0.85, 0.78, 0.65), img(vec2(fract(a / 6.2831853 + 0.5), clamp(r / capR, 0.0, 1.0))) * 1.1, 0.35);
    vec3 gillCol = cream * (0.35 + 0.5 * ridge) * (0.5 + 0.5 * smoothstep(0.0, 0.5, r));
    gillCol += imgPalette(hue * 0.159 + float(band) / 32.0) * ridge * e * 0.6;
    gillCol *= 0.6 + 0.4 * (1.0 - r / capR);                           // darker toward the rim
    col = mix(col, gillCol, underCap);
    // The stem: a pale column at the centre going up out of frame.
    float stem = step(abs(q.x), 0.12) * step(0.0, q.y);
    col = mix(col, cream * 0.7 * (0.6 + 0.4 * (1.0 - abs(q.x) / 0.12)), stem * underCap);
    // The rim edge.
    col = mix(col, cream * 0.4, smoothstep(0.015, 0.0, abs(r - capR)));
    // Spores: round, drifting down from the gills in slow curtains; the
    // side light (treble) picks them out; a kick puff brightens them.
    for (int layer = 0; layer < 3; ++layer)
    {
        float fl = float(layer);
        float fall = clock * (0.12 + 0.05 * fl);
        vec2 su = (p + vec2(0.02 * sin(clock * 0.7 + fl + p.y * 3.0), fall)) * (60.0 + 25.0 * fl);
        vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
        vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
        float below = smoothstep(capR + 0.1, capR - 0.3, r) * step(p.y, 0.45);
        float spore = smoothstep(0.16, 0.05, length(sf - so * 0.6)) * step(1.0 - 0.12 * sporeAmt, hash21(sc)) * below;
        vec3 sporeCol = mix(vec3(0.75, 0.7, 0.6), imgPalette(hue * 0.159 + 0.08), 0.3);
        col += sporeCol * spore * (0.25 + 0.9 * hi + 0.8 * audioKick) * (1.0 - fl * 0.25);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
