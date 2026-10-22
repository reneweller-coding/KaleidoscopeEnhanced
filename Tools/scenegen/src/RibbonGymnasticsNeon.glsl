//@doc
 * @brief RIBBON GYMNASTICS NEON: three neon ribbons whirl through a dark space like a gymnast's ribbons, drawing loops
 * and spirals whose traces hang in the air for a moment before they fade; they rise and fall with the melody and
 * throw a big loop at the start of every phrase.  A small field of the scene's own carries each ribbon's head: it
 * moves at a steady speed, turning by a curvature that is its own slow wave, a strong turn for a moment after a phrase
 * begins (the loop) and a pull toward the melody's height; it is drawn back toward the middle near the edges; the last
 * two seconds of its path are kept, sixty-four steps, and drawn as a tapering glowing line.  Shades of one colour family
 * from the photo, one for each ribbon.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the ribbons rise and fall with the melody (where the analysis is sure of it)
 *   audioPhrasePos   -> every phrase's start throws a big loop
 *   audioSwell       -> the ribbons' glow
 *
 * Knobs: speedP (how fast the ribbons move), widthP (the ribbons' width), hueP.
//@params speedP widthP
//@audio audioMelodyPitch audioMelodyConf audioPhrasePos audioSwell
//@state 64 3 30 32
//@body
/**  The state pass: row r is ribbon r; cell 0 its head (place and heading), the others its path, newest first.
 *
 * @return
 *   The head: x, y, heading, the last phrase position; a path cell: x, y, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    float fr = float(c.y);
    if (stateFrame < 0.5) return vec4(0.4 * sin(2.1 * fr), 0.2 * cos(1.7 * fr), 2.1 * fr, clamp(audioPhrasePos, 0.0, 1.0));
    if (c.x > 1) return texelFetch(texState, ivec2(c.x - 1, c.y), 0);
    vec4 head = texelFetch(texState, ivec2(0, c.y), 0);
    if (c.x == 1) return vec4(head.xy, 0.0, 1.0);                    // the newest point of the path
    float pp = clamp(audioPhrasePos, 0.0, 1.0);
    float since = pp;                                                 // the share of the phrase since it began
    float loop = 9.0 * exp(-since * 14.0) * smoothstep(0.0, 0.01, since);
    float conf = clamp(audioMelodyConf, 0.0, 1.0);
    float target = (clamp(audioMelodyPitch, 0.0, 1.0) - 0.45) * 1.4;
    float speed = (0.35 + 0.3 * clamp(speedP, 0.0, 1.0)) / 30.0;
    float k = 1.5 * sin(0.4 * sceneTime + 2.3 * fr) + loop * (mod(fr, 2.0) < 0.5 ? 1.0 : -1.0);
    vec2 dir = vec2(cos(head.z), sin(head.z));
    // turn toward the melody's height and back toward the middle near the edges
    vec2 want = vec2(-head.x * 0.8, (target * conf - head.y) * 1.5 - head.y * 0.6);
    float steer = dir.x * want.y - dir.y * want.x;
    float h = head.z + (k + 2.5 * steer) * speed * 3.0;
    vec2 pos = head.xy + vec2(cos(h), sin(h)) * speed;
    return vec4(pos, h, pp);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float wW = 0.006 + 0.008 * clamp(widthP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.02;
    for (int r = 0; r < 3; ++r) {
        float best = 9.0, age = 1.0;
        vec2 prev = texelFetch(texState, ivec2(0, r), 0).xy;
        for (int j = 1; j < 64; ++j) {
            vec2 cur = texelFetch(texState, ivec2(j, r), 0).xy;
            vec2 ab = cur - prev, ap = p - prev;
            float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
            if (d < best) { best = d; age = float(j) / 63.0; }
            prev = cur;
        }
        float w = wW * (1.0 - 0.7 * age);
        float g = exp(-pow(best / w, 2.0)) * 1.3 + 0.3 * exp(-best / (4.0 * w));
        col += famLight(fh, 0.2 + 0.3 * float(r), 0.4 + 0.3 * (1.0 - age)) * g * (1.0 - age) * glow;
    }
    finish(col);
}
