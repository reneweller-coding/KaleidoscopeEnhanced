//@doc
 * @brief SEA PEN LIGHT WAVES: a forest of sea pens -- feather-shaped colonies standing on the sea floor in rows, near
 * and far -- and at every onset in the music one of them is touched: a wave of light runs up it from its foot to its
 * tip and jumps to its neighbours, pen after pen, fading as it spreads.  A pen is a gently swaying stalk with leaves
 * slanting up from both sides, longest in its middle; its light at a place is the music's onset as it was as long ago
 * as the wave needed to get there -- the scene keeps the last four seconds of onsets in a field of its own.  The light
 * is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> every onset sends a wave of light up the pens and from pen to pen (kept for four seconds)
 *   audioAdvance -> the pens sway and the touch point wanders (integrated)
 *   audioSwell   -> the pens' resting glow
 *   audioBeatPhase -> a soft pulse on every beat, so quiet passages with weak onsets keep their light
 *
 * Knobs: penP (the pens' spacing), speedP (how fast the waves run), hueP.
//@params penP speedP
//@audio audioOnset audioBeatPhase audioSwell
//@state 256 1 60
//@body
/**  The state pass: the onsets of the last four seconds, the newest in cell 0, each step moving them one cell on.
 *
 * @return
 *   The onset this cell keeps, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    if (c.x == 0) return vec4(max(clamp(audioOnset, 0.0, 1.0), 0.4 * exp(-10.0 * clamp(audioBeatPhase, 0.0, 1.0))), 0.0, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
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
    return stLin(vec2(clamp(age * 60.0, 0.0, 254.0) + 0.5, 0.5)).r * (1.0 - smoothstep(3.6, 4.2, age));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float W0 = 0.12 + 0.06 * clamp(penP, 0.0, 1.0);
    float speed = 0.7 + 0.8 * clamp(speedP, 0.0, 1.0);
    float sway = 0.15 * sceneTime + 0.5 * audioAdvance;
    float rest = 0.1 + 0.15 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int r = 0; r < 3; ++r) {                                    // far rows first
        float fr = float(r);
        float sc = 0.55 + 0.25 * fr;
        float W = W0 * sc;
        float H = 0.55 * sc;
        float yb = 0.25 - 0.35 * fr - 0.45 * sc;                      // the row's foot
        float off = 0.37 * fr;
        float i0 = floor((p.x - off) / W);
        float touch = 6.0 * sin(0.07 * sway + 2.0 * fr);               // the touched pen wanders along the row
        for (int k = -1; k <= 1; ++k) {
            float i = i0 + float(k);
            float hi = fract(sin(i * 12.9898 + fr * 7.0) * 43758.5453);
            float t = (p.y - yb - 0.06 * sc * (hi - 0.5)) / (H * (0.8 + 0.3 * hi));   // each pen's foot a little apart
            if (t < 0.0 || t > 1.05) continue;
            float xb = off + (i + 0.5 + 0.25 * (hi - 0.5)) * W;
            float xs = xb + 0.04 * sc * sin(sway + 6.0 * hi) * t * t;   // the stalk bends as it sways
            float dx = p.x - xs;
            float stalk = exp(-pow(dx / (0.0025 * sc), 2.0)) * smoothstep(1.02, 0.95, t) * smoothstep(0.0, 0.25, t);
            // the leaves slant up from both sides, longest in the pen's middle
            float slope = 1.2 / (H * sc);
            float u = t - abs(dx) * slope;
            float kl = floor(u * 14.0 + 0.5);
            float leafLen = 0.35 * W * sin(3.14159265 * clamp(kl / 14.0, 0.0, 1.0)) * (0.5 + 0.5 * step(0.1, kl / 14.0));
            float dl = abs(u - kl / 14.0) * H / sqrt(1.0 + slope * slope * H * H);
            float leaf = exp(-pow(dl / (0.0022 * sc), 2.0)) * smoothstep(leafLen, leafLen * 0.7, abs(dx)) * smoothstep(0.0, 0.25, t);
            // the wave: from the touched pen along the row, then up each pen from foot to tip
            float age = (abs(i - touch) * 0.25 + t * 0.8) / speed;
            float wave = onsetAgo(age) * exp(-0.3 * age);
            float lit = rest + 2.2 * wave;
            col += famLight(fh, 0.3 + 0.4 * hi, 0.3 + 0.5 * wave) * (stalk + 0.8 * leaf) * lit * (0.5 + 0.25 * fr);
        }
    }
    finish(col);
}
