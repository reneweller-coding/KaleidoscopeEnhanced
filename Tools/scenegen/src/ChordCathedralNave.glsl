//@doc
 * @brief CHORD CATHEDRAL NAVE: every chord builds a bay of light -- a pair of columns and a pointed arch whose
 * proportions are the chord's intervals -- and the view moves down the nave of the chords played so far: the newest bay
 * still glowing as it is built, the older ones behind it in a long perspective.  A bay remembers its chord: a small
 * field of the scene's own keeps one slot per recent bay, written while its chord sounds and frozen when the harmony
 * moves on; the arch's radius against its width comes from the interval between the two strongest pitch classes, its
 * height from the third.  The newest bay is built at the nave's far end and the view stands ten bays before it, so it
 * glides on with every chord change; bays from before the first chord stand in plain proportions, dimmer.  Every bay's
 * window glows faintly, the column feet stand on a floor line that runs down the nave.  The light is shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> every chord change builds a new bay, and the view glides on down the nave
 *   audioChroma[12]  -> the bay's proportions: its arch from the chord's intervals
 *   audioSwell       -> the arches' glow
 *
 * Knobs: bayP (the bays' spacing), lineP (the lines' width), hueP.
//@params bayP lineP
//@audio audioHarmAdvance audioChroma[12] audioSwell
//@state 32 1 30 32
//@body
/**  The state pass: each slot keeps one bay's proportions; the current bay's slot follows its chord.
 *
 * @return
 *   x the arch's radius over its width, y its height, z the bay's number, 1.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    float k = floor(max(audioHarmAdvance, 0.0));
    vec4 old = stateFrame < 0.5 ? vec4(1.6, 1.0, -1.0, 1.0) : texelFetch(texState, ivec2(j, 0), 0);
    if (j != int(mod(k, 32.0))) return old;
    // the two (and three) strongest pitch classes
    int a = 0, b = 1, c = 2;
    float ca = -1.0, cb = -1.0, cc = -1.0;
    for (int i = 0; i < 12; ++i) {
        float v = audioChroma[i];
        if (v > ca) { cc = cb; c = b; cb = ca; b = a; ca = v; a = i; }
        else if (v > cb) { cc = cb; c = b; cb = v; b = i; }
        else if (v > cc) { cc = v; c = i; }
    }
    float i1 = float(abs(a - b)), i2 = float(abs(a - c));
    i1 = min(i1, 12.0 - i1);
    i2 = min(i2, 12.0 - i2);
    vec2 want = vec2(1.0 + 0.16 * i1, 0.8 + 0.07 * i2);
    vec2 now = old.z == k ? mix(old.xy, want, 0.1) : want;            // smoothly while the chord sounds
    return vec4(now, k, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float D = 0.8 + 0.4 * clamp(bayP, 0.0, 1.0);
    float lw = 1.2 + 1.2 * clamp(lineP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float zc = (h - 10.0) * D;
    const float W = 0.9, Y0 = -0.15, FOCAL = 1.2;
    vec3 col = famCol(fh, 0.45) * 0.015;
    // the floor line under the column feet, running down the nave
    float yEnd = (Y0 - 1.0) * FOCAL / (10.0 * D);                     // where the newest bay stands
    col += famCol(fh, 0.5) * 0.04 * exp(-pow(abs(abs(p.x) * (Y0 - 1.0) / W - p.y) / 0.004, 2.0)) * smoothstep(0.0, 0.01, yEnd - p.y);
    float kNew = floor(h);
    for (int i = 0; i < 12; ++i) {
        float k = kNew - float(i);
        float dz = k * D - zc;
        if (dz < 0.15) continue;
        vec4 bay = texelFetch(texState, ivec2(int(mod(k, 32.0)), 0), 0);
        bool built = bay.z == k;
        vec2 prop = built ? bay.xy : vec2(1.45, 1.0);                 // before the first chord: a plain bay
        float R = W * prop.x, apexH = prop.y;
        // the pixel taken to the bay's plane, in world units
        vec2 w = p * dz / FOCAL;
        float px = lw * dz / FOCAL / resolution.y;
        float ax = abs(w.x);
        float y = w.y - Y0;
        float cx = W - R;                                             // the right arc's centre lies left of the middle
        float rr = length(vec2(ax - cx, y / apexH));
        float arc = y >= 0.0 && ax <= W ? abs(rr - R) : 9.0;
        float col1 = abs(ax - W) + max(-1.0 - y, 0.0) + max(y, 0.0) * 9.0;
        float d = min(arc, col1);
        float inside = step(ax, W) * step(-1.0, y) * (y < 0.0 ? 1.0 : step(rr, R));
        float fresh = 1.0 - smoothstep(0.0, 1.0, h - k);              // the bay being built glows brighter
        float fade = exp(-0.12 * dz) * smoothstep(0.15, 0.6, dz) * (built ? 1.0 : 0.45);
        vec3 tone = famLight(fh, 0.3 + 0.4 * fract(k * 0.17), 0.4 + 0.4 * fresh);
        col += tone * exp(-pow(d / px, 2.0)) * fade * (0.6 + 1.2 * fresh) * glow;
        col += tone * inside * 0.012 * fade * (1.0 + 3.0 * fresh) * glow;   // the bay's window light
    }
    finish(col);
}
