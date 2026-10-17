//@doc
 * @brief CHROMATIC ABERRATION VORTEX: a field of vortices that twist the photo -- but not all of its colours alike:
 * red is turned least, green more, blue most, so wherever the picture is twisted it splits into its own rainbow,
 * coloured fringes spiralling round every vortex.  The vortices drift and turn; nothing in the picture is added,
 * it is all the photo, pulled apart by colour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far the colours part (slow: loud passages split the rainbow wider)
 *   audioPhase      -> the vortices turn (integrated)
 *   audioKick       -> the cores flash (light)
 *
 * Knobs: vorticesP (how many vortices), twistP (the base twist), spreadP (how far apart the channels turn), hueP.
//@params vorticesP twistP spreadP
//@audio audioSwell audioKick
//@body
/**  The photo coordinate after the vortex field's twist, scaled for one colour channel.
 *
 * @param p  The screen point. (in)
 * @param s  The channel's twist factor. (in)
 *
 * @return
 *   The twisted photo coordinate.
 **/
vec2 twisted(vec2 p, float s)
{
    int n = 3 + int(5.0 * clamp(vorticesP, 0.0, 1.0));
    float tw = (1.0 + 2.5 * clamp(twistP, 0.0, 1.0)) * s;
    vec2 q = p;
    for (int i = 0; i < 8; ++i) {
        if (i >= n) break;
        float fi = float(i);
        vec2 c = vec2(0.75 * sin(0.03 * sceneTime + fi * 2.3), 0.42 * cos(0.025 * sceneTime + fi * 1.7));
        vec2 d = q - c;
        float r = length(d);
        float sgn = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
        float ang = sgn * tw * exp(-r * r * 12.0) * (1.0 + 0.3 * sin(0.04 * audioPhase + fi));
        q = c + rot2(ang) * d;
    }
    return q * 0.75 + 0.5;
}

void main()
{
    vec2 p = screenP();
    float sp = (0.08 + 0.25 * clamp(spreadP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float r = imgLod(twisted(p, 1.0 - sp), 0.4).r;
    float g = imgLod(twisted(p, 1.0), 0.4).g;
    float b = imgLod(twisted(p, 1.0 + sp), 0.4).b;
    vec3 col = vec3(r, g, b) * 1.1;
    // the cores: where the field turns fastest (the twist's own strength)
    float core = 0.0;
    int n = 3 + int(5.0 * clamp(vorticesP, 0.0, 1.0));
    for (int i = 0; i < 8; ++i) {
        if (i >= n) break;
        float fi = float(i);
        vec2 c = vec2(0.75 * sin(0.03 * sceneTime + fi * 2.3), 0.42 * cos(0.025 * sceneTime + fi * 1.7));
        core = max(core, exp(-dot(p - c, p - c) * 300.0));
    }
    col += mix(imgPalette(0.5 + 0.03 * audioPhase), vec3(1.0), 0.6) * core * 0.4 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
