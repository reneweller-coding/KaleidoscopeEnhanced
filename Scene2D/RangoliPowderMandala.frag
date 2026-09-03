#version 330 core
out vec4 fragColor;
/**
 * @file RangoliPowderMandala.frag
 * @brief RANGOLI POWDER MANDALA: coloured powder laid on a threshold in a
 * radial design.  The design is laid down ring by ring over the scene arc
 * (each ring fills from its start angle around, as a hand would), the
 * grains are round specks of colour, the colours come from the chroma
 * classes (a class per ring), the kick sprinkles an extra pinch of powder
 * (light), the treble the mica sparkle, the swell the doorway lamp.
 * Camera fixed above the threshold.
 *
 * Audio Reactivity:
 *   sceneProgress   -> the design laid down (the arc)
 *   audioChroma[12] -> ring colour brightness (light)
 *   audioKick       -> sprinkle (light)
 *   audioHigh       -> mica sparkle (light)
 *   audioSwell      -> lamp (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: ringsP, petalsP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ringsP;
uniform float petalsP;
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
    float rings = floor(6.0 + 5.0 * clamp(ringsP, 0.0, 1.0));       // once per activation
    float petals = floor(8.0 + 8.0 * clamp(petalsP, 0.0, 1.0));
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float lamp = 0.8 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x);

    // The threshold: the photo as stone flags, warm in the lamp light.
    vec3 stone = img(gl_FragCoord.xy / resolution) * mix(vec3(0.55, 0.45, 0.35), imgPalette(hue * 0.159 + 0.1), 0.25) * 1.1 * lamp + 0.03;
    stone *= 0.85 + 0.15 * hash21(floor(p * 120.0));
    vec3 col = stone;
    // The design: rings from the centre out, each laid over a slice of the
    // arc, filling around from angle 0 as it is laid; each ring a petal
    // pattern (a rose curve) in its class colour, drawn as powder grains.
    float outerR = 0.62;
    for (int i = 0; i < 11; ++i)
    {
        float fi = float(i);
        if (fi >= rings) break;
        float r0 = outerR * fi / rings, r1 = outerR * (fi + 1.0) / rings;
        float t0 = fi / rings, t1 = (fi + 1.0) / rings;
        float laid = clamp((prog - t0) / (t1 - t0), 0.0, 1.0);        // how far around this ring is laid
        float around = fract(a / 6.2831853 + 0.25);
        float here = smoothstep(laid, laid - 0.03, around) * step(0.001, laid);
        float inRing = step(r0, r) * step(r, r1);
        int k = int(mod(fi * 5.0 + 2.0, 12.0));
        float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
        // The motif: petal lobes (rose curve) alternating with the ring index.
        float n = petals * (1.0 + mod(fi, 2.0));
        float lobe = 0.5 + 0.5 * cos(a * n + fi * 1.3);
        float band = (r - r0) / (r1 - r0);
        float motif = smoothstep(0.15, 0.35, lobe * 0.6 + (0.5 - abs(band - 0.5)) * 0.8);
        vec3 powder = mix(imgPalette(hue * 0.159 + float(k) / 12.0) * 1.6, vec3(0.95, 0.9, 0.7), 0.15) * (0.7 + 0.6 * e);
        vec3 powder2 = mix(vec3(0.95, 0.85, 0.3), imgPalette(hue * 0.159 + float(k) / 12.0 + 0.5), 0.5);
        vec3 pc = mix(powder2, powder, motif);
        // Grains: round specks, dense.
        vec2 gu = p * 260.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
        vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
        float grain = smoothstep(0.42, 0.25, length(gf - go * 0.5));
        float cover = inRing * here * (0.6 + 0.4 * grain);
        col = mix(col, pc * (1.1 + 0.4 * grain) * lamp, cover * 0.95);
        // Mica sparkle on the treble.
        col += vec3(1.0) * smoothstep(0.2, 0.05, length(gf - go * 0.5)) * step(0.93, hash21(gc + 7.0)) * inRing * here * hi * 0.6;
    }
    // The hand's pinch: where the design is being laid right now, a small
    // cloud of powder falls (brighter on the kick).
    float layingRing = floor(prog * rings);
    float rr = outerR * (layingRing + 0.5) / rings;
    float laidNow = fract(prog * rings);
    float aa = (laidNow - 0.25) * 6.2831853;
    vec2 hand = vec2(cos(aa), sin(aa)) * rr;
    float pinch = exp(-length(p - hand) * 25.0) * step(prog, 0.999);
    col += vec3(1.0, 0.9, 0.6) * pinch * (0.3 + 1.5 * audioKick);
    // The doorway lamp glow and a diya (oil lamp) at the centre.
    col *= 0.85 + 0.4 * exp(-r * 1.5) * lamp;
    col += vec3(1.0, 0.7, 0.3) * exp(-r * 30.0) * lamp * 1.2;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
