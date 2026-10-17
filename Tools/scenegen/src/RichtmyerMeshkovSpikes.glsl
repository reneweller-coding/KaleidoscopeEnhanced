//@doc
 * @brief RICHTMYER-MESHKOV SPIKES: an interface between two fluids, struck by a shock wave -- the ripples on it are
 * driven out into spikes of the heavy fluid and bubbles of the light one, the spikes narrow, the bubbles broad,
 * their tips curling.  Layer upon layer of such interfaces fills the frame, mirrored; at every phrase a bright shock
 * front sweeps across, and behind it the spikes shoot out again before they slowly sink back.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> each phrase sends a shock across the frame (its front moves continuously)
 *   audioChromaHue  -> the ripples' wavelength follows the key's hue (continuous)
 *   audioSwell      -> how far the spikes shoot
 *   audioKick       -> the shock front flashes (light)
 *
 * Knobs: layersP (interfaces on a screen height), spikeP (how narrow the spikes are), curlP (how much their tips
 * curl), hueP.
//@params layersP spikeP curlP
//@audio audioSwell audioKick audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float layers = 3.0 + 3.0 * clamp(layersP, 0.0, 1.0);
    // the shock: a front that crosses the frame in the first fifth of the phrase
    float sweep = prog / 0.2;
    float front = -0.6 + 1.2 * clamp(sweep, 0.0, 1.0);
    // since the shock passed this height: the spikes grow, then sink back over the phrase
    float since = clamp((prog - 0.2 * clamp((p.y + 0.6) / 1.2, 0.0, 1.0)) / 0.8, 0.0, 1.0);
    float amp = (0.06 + 0.18 * clamp(audioSwell, 0.0, 1.0)) * sin(3.14159265 * pow(since, 0.6));
    float y = p.y * layers;
    float li = floor(y + 0.5);
    float ly = y - li;                                          // -0.5..0.5 within the layer
    float side = mod(li, 2.0) < 0.5 ? 1.0 : -1.0;               // mirrored layer by layer
    float k = 6.2831853 * (5.0 + 2.0 * sin(audioChromaHue)) * layers / 3.0;
    float sx = p.x * k + 1.7 * li;
    // the interface: narrow spikes one way, broad bubbles the other, their tips curling sideways
    float sharpE = 2.0 + 6.0 * clamp(spikeP, 0.0, 1.0);
    float spike = pow(0.5 + 0.5 * cos(sx), sharpE);
    float curl = (0.2 + 0.8 * clamp(curlP, 0.0, 1.0)) * amp * spike * sin(sx * 2.0);
    float iface = side * (amp * (2.0 * spike - 0.3)) + curl * 0.5;
    float d = ly - iface;                                       // the side of the interface
    vec2 uv = vec2(p.x * 0.75 + 0.5 + curl * 0.3, p.y * 0.75 + 0.5);
    vec3 a = imgLod(uv, 0.5), b = imgLod(vec2(uv.x + 0.37, 1.0 - uv.y), 0.5);
    vec3 tA = imgPalette(0.1 + 0.03 * audioPhase), tB = imgPalette(0.6 + 0.03 * audioPhase);
    float w = smoothstep(-0.01, 0.01, d * side);
    vec3 col = mix(mix(b, b * tB * 1.6, 0.3) * 0.7, a, w);
    col += mix(mix(tA, tB, 0.5), vec3(1.0), 0.5) * exp(-d * d * 4000.0) * 0.35;
    // the shock front
    float sh = exp(-pow((p.y - front) * 60.0, 2.0)) * step(sweep, 1.0);
    col += mix(tA, vec3(1.0), 0.6) * sh * (0.6 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
