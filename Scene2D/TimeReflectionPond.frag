#version 330 core
out vec4 fragColor;
/**
 * @file TimeReflectionPond.frag
 * @brief TIME REFLECTION POND: ripples on a pond, seen from above through
 * the water to the photo on the pond floor -- and a time reflection: when
 * the medium changes abruptly in time (the drop), every wave reverses,
 * its outgoing rings running back to their sources.  The reversal is a
 * smooth change of the phase velocity sign over the drop envelope (the
 * waves slow, stop, run back), so it is continuous; the drop is the one
 * cut the rules allow.  Sources ring on the scene clock; the swell is the
 * wave amplitude; the treble the glints.  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance -> wave propagation (continuous)
 *   audioDrop    -> time reversal (the drop)
 *   audioSwell   -> amplitude (slow)
 *   audioHigh    -> glints (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: sourcesP, wavelenP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioDrop;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sourcesP;
uniform float wavelenP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nSrc = 3 + int(clamp(sourcesP, 0.0, 1.0) * 4.0);
    float k = 40.0 + 40.0 * (1.0 - clamp(wavelenP, 0.0, 1.0));
    float amp = 0.004 + 0.012 * clamp(audioSwell, 0.0, 1.0);
    float drop = clamp(audioDrop, 0.0, 1.0);
    // Time reflection: the wave time runs forward normally; during the drop
    // envelope the direction crosses smoothly to backward and returns.
    // We integrate nothing: the wave phase uses an effective time built
    // from the clock and a reversal term that is a smooth pulse.
    float clock = sceneAdvance * 0.6 + sceneTime * 0.12;
    float reversal = sin(clamp(drop, 0.0, 1.0) * 3.14159);     // 0 -> 1 -> 0 over the drop
    float tEff = clock - reversal * 2.2;                        // the waves run back while it rises

    // Height field: rings from sources, each with its own age since its
    // last ring (periodic on the clock), damped with distance.
    float h = 0.0; vec2 grad = vec2(0.0);
    for (int i = 0; i < 7; ++i)
    {
        if (i >= nSrc) break;
        float fi = float(i);
        vec2 c = vec2((hash11(fi * 3.7) - 0.5) * aspect * 0.9, (hash11(fi * 5.3) - 0.5) * 0.9);
        float d = length(p - c);
        float phase = d * k - tEff * 6.0 + hash11(fi * 7.1) * 6.28;
        float env = exp(-d * 1.8);
        float w = sin(phase) * env;
        h += w * amp;
        grad += (p - c) / max(d, 1e-3) * cos(phase) * env * k * amp;
    }
    // Refraction: look through the surface to the floor (the photo).
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 refr = uv - grad * 0.5;
    vec3 floorCol = img(clamp(refr, 0.0, 1.0));
    floorCol = mix(floorCol, floorCol * imgPalette(hue * 0.159 + 0.55) * 1.5, 0.25);
    // Water tint and depth.
    vec3 water = mix(vec3(0.1, 0.3, 0.35), imgPalette(hue * 0.159 + 0.6), 0.3);
    vec3 col = mix(floorCol, water, 0.25);
    // Sky reflection along the slope, glints on the treble.
    float slope = length(grad);
    float glint = pow(clamp(slope * 8.0, 0.0, 1.0), 3.0);
    col += vec3(0.9, 0.95, 1.0) * glint * (0.2 + 0.8 * clamp(audioHigh * 2.0, 0.0, 1.0));
    // Caustics: the floor brightens where the surface focuses light.
    col += floorCol * clamp(-h * 40.0, 0.0, 1.0) * 0.5;
    // The reversal tints the whole pond for its moment.
    col = mix(col, col * imgPalette(hue * 0.159 + 0.9) * 1.6, reversal * 0.35);
    // The sources: round pebbles where the rings begin.
    for (int i = 0; i < 7; ++i)
    {
        if (i >= nSrc) break;
        float fi = float(i);
        vec2 c = vec2((hash11(fi * 3.7) - 0.5) * aspect * 0.9, (hash11(fi * 5.3) - 0.5) * 0.9);
        col = mix(col, vec3(0.2, 0.18, 0.15), smoothstep(0.014, 0.008, length(p - c)));
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
