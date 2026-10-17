//@doc
 * @brief TIMBRE SCULPTURE: the sound's colour as a shape -- a surface whose ripples are the spectrum: every one of
 * thirty-two bands raises a wave train of its own wavelength and direction, the low bands long swells, the high
 * bands fine ripples, each as high as its band is loud (smoothed on the state pass).  So a mellow sound makes broad
 * gentle dunes, a bright one a crisp fine-grained skin, a noisy one a turbulent sea; the surface tiles without end
 * and drifts, and the photo lies on it, lit by its slopes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum   -> each band's wave train (32, smoothed on the state pass)
 *   audioAdvance    -> the surface drifts and its waves travel (integrated)
 *
 * Knobs: reliefP (how high the waves stand), detailP (how fine the high bands are), photoP (photo share), hueP.
//@params reliefP detailP photoP
//@audio audioSpectrum[32]
//@state 32 1 60
//@body
/**  The state pass: each band smoothed over about half a second.
 *
 * @return
 *   The smoothed band, 0, 0, 1.
 **/
vec4 stateStep()
{
    int i = int(gl_FragCoord.x);
    float v = clamp(audioSpectrum[i], 0.0, 1.5);
    if (stateFrame < 0.5) return vec4(v, 0.0, 0.0, 1.0);
    return vec4(mix(texelFetch(texState, ivec2(i, 0), 0).r, v, 0.04), 0.0, 0.0, 1.0);
}

/**  The surface's height and slope: thirty-two wave trains, one per band.
 *
 * @param x     The point. (in)
 * @param tw    The waves' travel. (in)
 * @param fine  How fine the high bands are. (in)
 *
 * @return
 *   The height (x) and its gradient (yz).
 **/
vec3 surface(vec2 x, float tw, float fine)
{
    vec3 hg = vec3(0.0);
    for (int i = 0; i < 32; ++i) {
        float fi = float(i);
        float amp = texelFetch(texState, ivec2(i, 0), 0).r / (1.0 + 0.12 * fi);
        float k = 4.0 * pow(1.0 + 0.12 * fine, fi) + 2.0 * fi;   // the wave number grows with the band
        float a = 2.399963 * fi;                                // golden-angle directions
        vec2 dir = vec2(cos(a), sin(a));
        float ph = k * dot(x, dir) - tw * (1.0 + 0.1 * fi) + 1.7 * fi;
        hg += amp * vec3(sin(ph) / k * 4.0, cos(ph) * dir * 4.0);
    }
    return hg;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float relief = 0.6 + 1.2 * clamp(reliefP, 0.0, 1.0);
    float fine = 0.5 + 1.0 * clamp(detailP, 0.0, 1.0);
    float tw = 0.4 * sceneTime + 1.5 * audioAdvance;
    vec2 x = p + vec2(0.02 * sceneTime + 0.05 * audioAdvance, 0.01 * sceneTime);
    vec3 s = surface(x, tw, fine);
    vec2 g = s.yz * relief * 0.22;
    vec3 n = normalize(vec3(-g, 1.0));
    float la = 0.03 * sceneTime;
    vec3 l = normalize(vec3(cos(la), sin(la), 0.8));
    float diff = 0.15 + 1.1 * max(dot(n, l), 0.0);
    float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 30.0);
    vec3 photo = imgLod(x * 0.5 + 0.5 + g * 0.06, 0.4);
    vec3 tone = imgPalette(0.4 + s.x * 0.1 + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.2, photo * 1.3, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * diff + spec * 0.35;
    finish(col);
}
