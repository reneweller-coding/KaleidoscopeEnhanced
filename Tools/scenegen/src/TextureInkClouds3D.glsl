//@doc
 * @brief TEXTURE INK CLOUDS 3D: clouds of ink in the photo's colours bloom in the dark space before the eye: every
 * onset releases a new cloud somewhere ahead, which swells, curls and slowly thins away, while the whole space drifts
 * with the music's drive.  A small field of the scene's own keeps the last ten clouds -- each its birth, its place and
 * its colour's seed -- written into the next slot on an onset (a rise past a threshold, at most one every 0.4
 * seconds); the view marches through the space in steps, gathering each cloud's glowing ink: a ball that grows like the
 * square root of its age, its edge torn by noise, thinning as it ages.  The inks are the photo's colours, calmed toward
 * one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> every onset releases a new cloud (at most one every 0.4 s)
 *   audioAdvance -> the space drifts (integrated)
 *   audioSwell   -> the inks' glow
 *   audioBeatPhase -> a quiet passage releases a cloud on a beat when no onset did for two seconds
 *
 * Knobs: sizeP (how big the clouds grow), curlP (how torn their edges are), hueP.
//@params sizeP curlP
//@audio audioOnset audioBeatPhase audioSwell
//@state 11 1 60 32
//@body
/**  The state pass: ten cloud slots and an eleventh that remembers the last onset, the clouds so far, the last
 * release's time and the last beat phase.
 *
 * @return
 *   A cloud: its birth (s), its place x, y and its seed; or the bookkeeping: last onset, clouds so far, last release, last beat phase.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    float now = stateFrame / 60.0;
    float on = clamp(audioOnset, 0.0, 1.0), bt = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return j == 10 ? vec4(on, 0.0, -1.0, bt) : vec4(-100.0, 0.0, 0.0, 0.0);
    vec4 book = texelFetch(texState, ivec2(10, 0), 0);
    bool rel = (on > 0.45 && book.x <= 0.45 && now - book.z > 0.4) || (bt < book.w - 0.5 && now - book.z > 2.0);
    if (j == 10) return vec4(on, rel ? mod(book.y + 1.0, 1000.0) : book.y, rel ? now : book.z, bt);
    if (rel && j == int(mod(book.y, 10.0))) {
        float k = book.y;
        return vec4(now, 1.6 * (fract(k * 0.7548777 + 0.1) - 0.5), 0.9 * (fract(k * 0.5698403 + 0.3) - 0.5), fract(k * 0.618034));
    }
    return texelFetch(texState, ivec2(j, 0), 0);
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
    float now = (stateFrame - 1.0 + stateFrac) / 60.0;                // the newest step's time carried on
    float drift = 0.05 * sceneTime + 0.2 * audioAdvance;
    float grow = 0.35 + 0.25 * clamp(sizeP, 0.0, 1.0);
    float curl = 0.4 + 0.5 * clamp(curlP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec4 cl[10];
    for (int j = 0; j < 10; ++j) cl[j] = texelFetch(texState, ivec2(j, 0), 0);
    vec3 rd = normalize(vec3(p, 1.0));
    vec3 col = vec3(0.0);
    float trans = 1.0;
    float t = 1.2 + 0.12 * hash21(gl_FragCoord.xy);
    for (int s = 0; s < 22; ++s) {
        vec3 x = rd * t;
        float dens = 0.0;
        vec3 ink = vec3(0.0);
        for (int j = 0; j < 10; ++j) {
            float age = now - cl[j].x;
            if (age < 0.0 || age > 14.0) continue;
            vec3 c = vec3(cl[j].yz * 2.2, 3.2 + 1.2 * fract(cl[j].w * 7.0));
            float R = grow * sqrt(age + 0.05);
            vec3 d = x - c;
            float b = 1.0 - length(d) / R;
            if (b <= -0.3) continue;
            float n = fbm(d.xy * 2.5 / R + vec2(d.z * 1.7, drift + cl[j].w * 9.0));
            float dj = smoothstep(0.0, 0.5, b + curl * (n - 0.5)) * exp(-age * 0.18) * smoothstep(0.0, 0.4, age);
            dens += dj;
            ink += tone(imgLod(vec2(0.2 + 0.6 * cl[j].w, 0.5 + 0.3 * sin(cl[j].w * 20.0)), 2.0), fh) * dj;
        }
        if (dens > 0.001) {
            vec3 c = ink / dens;
            float a = 1.0 - exp(-dens * 0.45);
            col += trans * a * c * glow * 1.4;
            trans *= 1.0 - a;
            if (trans < 0.02) break;
        }
        t += 0.25;
    }
    col += famCol(fh, 0.4) * 0.03 * trans;
    finish(col);
}
