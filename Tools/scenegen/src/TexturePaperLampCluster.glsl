//@doc
 * @brief TEXTURE PAPER LAMP CLUSTER: a cluster of paper lamps floats in the dark, each one's paper a piece of the photo
 * glowing from within; they swing on their cords in time with the music, glow brighter as it swells, and every new
 * section rearranges the cluster -- the lamps drift to their new places.  Every lamp is a sphere hanging on a cord at
 * its own depth; a place on the screen shows the nearest lamp that covers it, lit from inside (brightest in the middle,
 * with the paper's ribs and dark caps), and the glow of all of them.  The swing is a pendulum moved on by the beats
 * counted in a small field of the scene's own; a section's arrangement comes from its number, and the lamps glide from
 * the last section's places over six seconds.  The paper is the photo, warmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase     -> the lamps swing on their cords (beats counted, so the swing runs on smoothly)
 *   audioSectionId/Age -> every section rearranges the cluster (the lamps drift to their places over six seconds)
 *   audioSwell         -> the lamps' glow
 *
 * Knobs: countP (how many lamps), sizeP (the lamps' size), hueP.
//@params countP sizeP
//@audio audioBeatPhase audioSectionId audioSectionPrev audioSectionAge audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps.
 *
 * @return
 *   x the beats so far, y the last beat phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4096.0), bp, 0.0, 1.0);
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

/**  A lamp's place in a section's arrangement.
 *
 * @param i    The lamp. (in)
 * @param sec  The section. (in)
 *
 * @return
 *   The place (view space).
 **/
vec3 lampAt(float i, float sec)
{
    vec2 h = hash22(vec2(i * 1.7 + 3.1, sec * 5.3 + 1.0));
    float z = 2.0 + 5.0 * fract(i * 0.618034 + 0.37 * sec);
    vec2 xy = vec2(1.0 * (fract(i * 0.7548777 + h.x * 0.3) - 0.5), 0.55 * (fract(i * 0.5698403 + h.y * 0.3) - 0.5)) * 2.2;
    return vec3(xy * z * 0.85, z);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float n = floor(14.0 + 14.0 * clamp(countP, 0.0, 1.0));
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float sA = max(audioSectionPrev, 0.0), sB = max(audioSectionId, 0.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 warm = famLight(fh, 0.75, 0.35);
    vec3 col = famCol(fh, 0.3) * 0.02;
    float bestZ = 1e9;
    vec3 bestC = vec3(0.0);
    vec3 halo = vec3(0.0);
    for (int k = 0; k < 28; ++k) {
        float i = float(k);
        if (i >= n) break;
        vec3 c = mix(lampAt(i, sA), lampAt(i, sB), m * m * (3.0 - 2.0 * m));
        float R = (0.34 + 0.2 * hash11(i * 3.3)) * (0.8 + 0.4 * clamp(sizeP, 0.0, 1.0));
        float swing = 0.12 * sin(3.14159265 * beats / 2.0 + 6.2831853 * hash11(i + 9.0));
        float L = 1.2;                                                // the cord's length
        c.x += L * sin(swing);
        c.y += L * (1.0 - cos(swing));
        vec2 sc = c.xy / c.z * F;
        float rs = R / c.z * F;
        vec2 d = (p - sc) / rs;
        float rr = length(d);
        // the cord, up from the lamp's top
        float cord = exp(-pow(abs(p.x - sc.x + (p.y - sc.y) * sin(swing)) * resolution.y / 1.2, 2.0)) * step(sc.y + rs * 0.95, p.y);
        halo += warm * cord * 0.08 / c.z;
        halo += warm * exp(-rr * 1.2) * 0.1 * glow / (0.5 + 0.3 * c.z);
        if (rr < 1.0 && c.z < bestZ) {
            bestZ = c.z;
            float ribs = 0.85 + 0.15 * cos(asin(clamp(d.y, -1.0, 1.0)) * 14.0);
            float caps = 1.0 - smoothstep(0.78, 0.82, abs(d.y));
            vec3 paper = tone(imgLod(vec2(0.2 + fract(0.31 * i) * 0.6, 0.3 + fract(0.17 * i) * 0.4) + d * 0.18, 1.5), fh);   // mirrored, no seam
            paper = mix(paper, warm * (0.4 + 0.8 * luma(paper)), 0.35);
            float inner = 0.55 + 0.6 * sqrt(max(1.0 - rr * rr, 0.0));
            bestC = paper * inner * ribs * mix(0.15, 1.0, caps) * glow * exp(-0.06 * c.z) * 1.1;
        }
    }
    col = bestZ < 1e8 ? bestC : col;
    col += halo;
    finish(col);
}
