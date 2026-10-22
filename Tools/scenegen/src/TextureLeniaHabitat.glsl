//@doc
 * @brief TEXTURE LENIA HABITAT: Lenia creatures live on the photo: soft glowing cells that grow, glide, divide and
 * fade, feeding on its brightness -- they thrive on the bright places and starve on the dark ones; they grow faster as
 * the music swells, and every section shifts the laws of their life a little, gliding.  The creatures are a continuous
 * cellular automaton in a field of the scene's own: every cell sums its neighbours on a ring (eight radii, forty
 * directions, weighted like Lenia's shell kernel; measured in numpy: the creatures' size follows the radius, and
 * fewer samples break them into crumbs) and grows or shrinks by the bell-shaped growth of that sum; growth is
 * stronger where the photo is bright.  Now and then a new creature is planted on an empty place, so the habitat never
 * dies out.  The creatures glow in the photo's colours, calmed toward one colour family, over the dimmed photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell         -> the creatures' growth rate
 *   audioSectionId/Age -> every section shifts the growth's centre and width (gliding over six seconds)
 *
 * Knobs: radiusP (the creatures' size), glowP (how bright they glow), hueP.
//@params radiusP glowP
//@audio audioSwell audioSectionId audioSectionPrev audioSectionAge
//@state 240 135 30 32
//@body
/**  The growth's centre and width for a section.
 *
 * @param s  The section. (in)
 *
 * @return
 *   x the centre, y the width.
 **/
vec2 lawOf(float s)
{
    float j = mod(s, 3.0);
    return j < 0.5 ? vec2(0.15, 0.015) : j < 1.5 ? vec2(0.15, 0.017) : vec2(0.14, 0.014);
}

/**  The kernel's radius in cells, the same in both passes.
 *
 * @return
 *   The radius.
 **/
float kernelR()
{
    return 13.0 + 3.0 * clamp(radiusP, 0.0, 1.0);
}

/**  The state pass: one Lenia step, fed by the photo's brightness, with a creature planted now and then.
 *
 * @return
 *   x the life, y the neighbours' sum, z the food, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    vec2 cc = vec2(c) + 0.5;
    float food = luma(imgLod(cc / stateRes, 3.0));
    if (stateFrame < 0.5) {
        float n = noise2(cc * 0.15);
        return vec4(hash21(floor(cc / 14.0)) > 0.55 ? smoothstep(0.35, 0.7, n) : 0.0, 0.0, food, 1.0);
    }
    float R = kernelR();
    float A = stAt(c).r;
    float U = 0.0, W = 0.0;
    for (int ri = 0; ri < 8; ++ri) {
        float rr = (float(ri) + 0.5) / 8.0;
        float w = exp(-0.5 * pow((rr - 0.5) / 0.15, 2.0));
        for (int k = 0; k < 40; ++k) {
            float an = (float(k) + 0.5 * float(ri % 2)) * 0.15707963;
            U += w * stLin(cc + R * rr * vec2(cos(an), sin(an))).r;
            W += w;
        }
    }
    U /= W;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    vec2 law = mix(lawOf(max(audioSectionPrev, 0.0)), lawOf(max(audioSectionId, 0.0)), m);
    float G = 2.0 * exp(-0.5 * pow((U - law.x) / law.y, 2.0)) - 1.0;
    if (G > 0.0) G *= 0.5 + food;
    float dt = 0.05 + 0.08 * clamp(audioSwell, 0.0, 1.0);
    A = clamp(A + dt * G, 0.0, 1.0);
    // now and then a new creature on an empty place
    vec2 at = vec2(stRandStep(0), stRandStep(1)) * stateRes;
    vec2 d = cc - at;
    d -= stateRes * floor(d / stateRes + 0.5);                        // across the torus
    if (stRandStep(2) > 0.96 && U < 0.03 && dot(d, d) < R * R)
        A = max(A, (0.4 + 0.6 * hash21(cc + stateFrame)) * (1.0 - smoothstep(0.3 * R, R, length(d))));
    return vec4(A, U, food, 1.0);
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
    vec2 cc = stView(p, 1.0);
    float A = stLin(cc).r;
    float Ax = stLin(cc + vec2(1.0, 0.0)).r - stLin(cc - vec2(1.0, 0.0)).r;
    float Ay = stLin(cc + vec2(0.0, 1.0)).r - stLin(cc - vec2(0.0, 1.0)).r;
    vec2 uv = cc / stateRes;
    vec3 photo = tone(imgLod(fract(uv), 1.5), fh);
    float g = 0.6 + 0.8 * clamp(glowP, 0.0, 1.0);
    vec3 life = mix(photo * 1.2, famLight(fh, 0.6, 0.5), 0.35);
    vec3 col = photo * 0.14 + life * smoothstep(0.05, 0.8, A) * g + famLight(fh, 0.6, 0.7) * min(length(vec2(Ax, Ay)) * 1.5, 1.0) * 0.5 * g;
    finish(col);
}
