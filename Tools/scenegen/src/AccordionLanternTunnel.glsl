//@doc
 * @brief ACCORDION LANTERN TUNNEL: inside a folding paper lantern that never ends: pleated paper walls glow warm, the
 * pleats run past as rings, wire hoops hold them every few folds, and waves of light run outward from the lantern's
 * far end with the music.  The pleats are a triangle wave along the tube: each facet leans toward or away from the
 * light, its ridge catching a bright line; every onset sends a ring of brighter light from the far end toward the eye
 * (the scene keeps four seconds of onsets in a field of its own).  The paper is the photo, calmed toward one warm colour
 * family.  Distinct from TextureLanternTunnel, which shows lanterns in a tunnel.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> rings of light running from the far end toward the eye (kept for four seconds)
 *   audioSwell   -> the paper's glow
 *   audioAdvance -> the flight (integrated)
 *   audioPhase   -> the lantern turns slowly (integrated)
 *
 * Knobs: pleatP (the pleats' spacing), warmP (how warm the light is), hueP.
//@params pleatP warmP
//@audio audioOnset audioSwell audioPhase
//@state 256 1 60
//@body
/**  The state pass: the onsets of the last four seconds, the newest in cell 0.
 *
 * @return
 *   x the onset, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    if (c.x == 0) return vec4(clamp(audioOnset, 0.0, 1.0), 0.0, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0);
    return texelFetch(texState, ivec2(c.x - 1, 0), 0);
}

/**  The music's onset as it was a while ago.
 *
 * @param age  How long ago, in seconds. (in)
 *
 * @return
 *   The onset then (0 beyond four seconds).
 **/
float onsetAgo(float age)
{
    return stLin(vec2(clamp(age * 60.0 - stateFrac, 0.0, 254.0) + 0.5, 0.5)).r * (1.0 - smoothstep(3.6, 4.2, age));
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4, ZF = 10.0, C = 5.0;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x) + 0.01 * sceneTime + 0.1 * audioPhase;
    float z = R0 / r;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float P = 0.1 + 0.08 * clamp(pleatP, 0.0, 1.0);                  // the pleats' spacing
    float t = (z + fly) / P;
    float dt = R0 / (r * r * P * resolution.y);                       // a pixel in pleats
    float detail = 1.0 - smoothstep(0.15, 0.4, dt);
    float tri = abs(fract(t) - 0.5) * 2.0;                            // 0 in the valley, 1 on the ridge
    float facet = mix(0.75, 0.55 + 0.45 * tri, detail);
    float ridge = exp(-pow((1.0 - tri) * 0.5 / (1.2 * dt), 2.0)) * detail;
    float valley = exp(-pow(tri * 0.5 / (1.2 * dt), 2.0)) * detail;
    // the wire hoops every eight pleats
    float th = (z + fly) / (8.0 * P);
    float hoop = exp(-pow((0.5 - abs(fract(th) - 0.5)) / (1.5 * dt / 8.0 + 0.004), 2.0));
    // the paper: the photo in broad patches round and along
    vec2 puv = vec2(0.5 + 0.3 * cos(a), 0.5 + 0.3 * sin(a)) + vec2(0.0, 0.07 * floor(th));
    vec3 paper = tone(imgLod(fract(puv), 4.0), fh);
    vec3 warm = famLight(fh, 0.75, 0.3 + 0.3 * clamp(warmP, 0.0, 1.0));
    paper = mix(paper, warm * (0.4 + 0.8 * luma(paper)), 0.35);
    float pulse = onsetAgo(max(ZF - z, 0.0) / C);
    float glow = 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0) + 0.9 * pulse;
    vec3 col = paper * facet * glow * 0.8;
    col += warm * ridge * 0.25 * glow - paper * valley * 0.25;
    col = mix(col, vec3(0.02, 0.015, 0.01) + warm * 0.1, hoop * 0.8);
    // the far end: the candle's glow
    col = mix(col, warm * 0.55, smoothstep(5.0, 18.0, z));
    col += warm * exp(-r * 8.0) * (0.4 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    finish(max(col, vec3(0.0)));
}
