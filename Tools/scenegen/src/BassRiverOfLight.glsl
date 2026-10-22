//@doc
 * @brief BASS RIVER OF LIGHT: the bass line as a glowing river winding away into the distance over a dark plain: where
 * the bass was strong the river swings wide, where it was quiet it runs straight, and the other voices float on it as
 * lights -- the middle voice to one side, the highs to the other -- all of it flowing away from the eye as it ages.  A
 * small field of the scene's own keeps the last four seconds of the bass, middle and high levels, smoothed over half a
 * second so that the river near the eye follows the music's swell, not every kick; the river at a depth shows the bass
 * of that age, and a light floats there where the middle or the highs were strong.  The light is shades of one colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass               -> the river's swing: the bass line drawn into the plain (kept for four seconds)
 *   audioMid, audioHigh     -> the lights floating on the river
 *   audioAdvance            -> the river meanders slowly (integrated)
 *   audioSwell              -> the water's glow
 *
 * Knobs: widthP (the river's width), swingP (how far the bass swings it), hueP.
//@params widthP swingP
//@audio audioBass audioMid audioHigh audioSwell
//@state 128 1 30 32
//@body
/**  The state pass: the bass, middle and high levels over the last four seconds, the newest in cell 0.
 *
 * @return
 *   x the bass, y the middle, z the highs, 1.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    if (j > 0) return stateFrame < 0.5 ? vec4(0.0) : texelFetch(texState, ivec2(j - 1, 0), 0);
    vec4 old = stateFrame < 0.5 ? vec4(0.0) : texelFetch(texState, ivec2(0, 0), 0);
    vec3 now = clamp(vec3(audioBass, audioMid, audioHigh), 0.0, 1.0);
    return vec4(mix(old.xyz, now, 0.08), 1.0);                     // the envelope, not every kick: no strobe near the eye
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float width = 0.12 + 0.1 * clamp(widthP, 0.0, 1.0);
    float swing = 0.6 + 0.8 * clamp(swingP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    const float HORIZON = 0.18, EYE = 0.4;
    vec3 col = famCol(fh, 0.45) * 0.015 + famCol(fh, 0.5) * 0.05 * exp(-pow((p.y - HORIZON) / 0.05, 2.0));
    if (p.y < HORIZON - 0.003) {
        float z = EYE / (HORIZON - p.y);                              // the depth on the plain
        float x = p.x * z;
        float j = clamp((z - 0.4) * 12.0 - stateFrac, 0.0, 126.0);   // the age shown at this depth (moving on smoothly)
        vec4 h = stLin(vec2(j + 0.5, 0.5));
        float centre = swing * (h.x - 0.3) * sin(0.6 * z + run) + 0.4 * sin(0.25 * z + 0.7 * run);
        float d = abs(x - centre);
        float water = smoothstep(width, width * 0.6, d);
        float streak = 0.6 + 0.4 * noise2(vec2(x * 8.0, z * 2.0 - 3.0 * run));
        float fade = exp(-0.08 * z);
        col += famLight(fh, 0.4, 0.3) * water * streak * (0.3 + 0.9 * h.x) * fade * glow;
        col += famLight(fh, 0.5, 0.6) * exp(-pow((d - width) * resolution.y / z / 1.5, 2.0)) * 0.4 * fade;   // the banks
        // the voices' lights floating on the river
        vec2 lm = vec2(centre - 0.5 * width, 0.0), lh = vec2(centre + 0.5 * width, 0.0);
        float pm = exp(-pow((x - lm.x) / (0.03 * z), 2.0)) * smoothstep(0.35, 0.6, h.y);
        float ph = exp(-pow((x - lh.x) / (0.03 * z), 2.0)) * smoothstep(0.3, 0.55, h.z);
        float pulse = 0.5 + 0.5 * cos(6.2831853 * fract(j / 6.0));
        col += (famLight(fh, 0.2, 0.7) * pm + famLight(fh, 0.8, 0.7) * ph) * pulse * fade * 1.2;
    }
    finish(famExpose(col, 4.50, 0.80, 0.05, fh));
}
