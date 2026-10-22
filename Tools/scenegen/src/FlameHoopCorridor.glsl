//@doc
 * @brief FLAME HOOP CORRIDOR: a flight through hoops of fire, one after another: flames lick up from every hoop -- up
 * and out from its upper arc, up into the opening from its lower one -- glowing with the music's swell, and when the
 * music strikes the hoops flare one after another from the near ones into the distance.  Every hoop is a circle in a
 * plane across the flight; the flame at a place rises from the point of the hoop below it, a column of rising noise
 * that thins with height.  The flare is the onset of as long ago as it needed to reach the hoop (the scene keeps four
 * seconds of onsets in a field of its own).  The fire is a ramp of shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> the hoops flare one after another into the distance (kept for four seconds)
 *   audioSwell   -> the fire's glow and height
 *   audioAdvance -> the flight through the hoops (integrated)
 *
 * Knobs: gapP (the hoops' spacing), flameP (the flames' height), hueP.
//@params gapP flameP
//@audio audioOnset audioSwell
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

/**  The fire rising from one arc of a hoop.
 *
 * @param w     The place in the hoop's plane. (in)
 * @param yh    The hoop's height below (or at) the place. (in)
 * @param R     The hoop's radius. (in)
 * @param H     The flames' height. (in)
 * @param k     The hoop's number. (in)
 *
 * @return
 *   The fire's density.
 **/
float fire(vec2 w, float yh, float R, float H, float k)
{
    float dy = w.y - yh;
    if (dy < -0.03) return 0.0;
    float t = 1.6 * sceneTime;
    float n = fbm(vec2(w.x * 7.0 + k * 3.1, dy * 5.0 - t)) * 0.7 + 0.3 * noise2(vec2(w.x * 18.0, dy * 9.0 - 1.5 * t));
    float height = H * (0.6 + 0.8 * n);
    float body = (1.0 - smoothstep(0.0, height, dy)) * smoothstep(-0.03, 0.01, dy);
    return body * smoothstep(0.25, 0.65, n + 0.35 * (1.0 - dy / max(height, 1e-3)));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1, R = 0.7;
    float D = 1.0 + 0.6 * clamp(gapP, 0.0, 1.0);
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    vec3 cHot = famLight(fh, 0.85, 0.85), cMid = famLight(fh, 0.65, 0.6), cLow = famCol(fh, 0.4);
    vec3 col = famCol(fh, 0.3) * 0.02;
    float k0 = floor(fly / D) + 1.0;
    for (int i = 0; i < 10; ++i) {
        float k = k0 + float(i);
        float dz = k * D - fly;
        vec2 w = p * dz / F;
        float fade = exp(-0.1 * dz) * smoothstep(0.0, 0.5, dz);
        float flare = onsetAgo(dz / 5.0);
        float H = (0.22 + 0.18 * clamp(flameP, 0.0, 1.0)) * (0.7 + 0.5 * sw + 0.6 * flare);
        float f = 0.0;
        if (abs(w.x) < R) {
            float yc = sqrt(R * R - w.x * w.x);
            f = max(fire(w, yc, R, H, k), fire(w, -yc, R, H * 0.8, k + 0.5));
        }
        float hoop = exp(-pow((length(w) - R) / (0.012 + dz / F / resolution.y), 2.0));
        vec3 fc = mix(cLow, mix(cMid, cHot, smoothstep(0.5, 0.9, f)), smoothstep(0.1, 0.5, f));
        col += fc * f * (1.1 + 0.6 * sw + 0.8 * flare) * fade + cMid * hoop * 0.4 * fade + cLow * f * 0.4 * fade;
    }
    col += famLight(fh, 0.6, 0.6) * exp(-length(p) * 7.0) * 0.2;
    finish(famExpose(col, 1.25, 1.00, 0.03, fh));
}
