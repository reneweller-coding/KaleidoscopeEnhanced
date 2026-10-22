//@doc
 * @brief DUST REVEALS FORMS: glowing dust settles on invisible forms and gives them away -- a cluster of spheres, a
 * torus knot, a wavy sheet -- then a wind blows it off and it drifts until it settles on the next form.  The dust is
 * a fine jittered 3D lattice of grains; a grain shows when it lies near the current form's surface while the dust is
 * settled, and is carried away along the wind (and faded) as it blows.  The eye circles slowly.  The grains' light is
 * shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos     -> settling and blowing away: the form appears through the phrase's first half and blows
 *                         away through its end (smooth)
 *   audioSectionId/Age -> every new section brings another form (the forms cross-faded over six seconds)
 *   audioAdvance       -> the eye circles (integrated)
 *
 * Knobs: grainP (how fine the dust is), windP (how far the wind carries it), hueP.
//@params grainP windP
//@audio audioPhrasePos audioSectionId audioSectionPrev audioSectionAge
//@body
/**  A form's distance.
 *
 * @param x     The point. (in)
 * @param kind  0 spheres, 1 torus, 2 wavy sheet. (in)
 *
 * @return
 *   The distance.
 **/
float formD(vec3 x, float kind)
{
    if (kind < 0.5) {
        float d = length(x - vec3(0.25, 0.1, 0.0)) - 0.32;
        d = min(d, length(x - vec3(-0.3, -0.05, 0.15)) - 0.24);
        return min(d, length(x - vec3(0.0, 0.3, -0.2)) - 0.18);
    }
    if (kind < 1.5) return length(vec2(length(x.xz) - 0.4, x.y)) - 0.13;
    return abs(x.y - 0.15 * sin(4.0 * x.x) * cos(3.0 * x.z)) * 0.7 - 0.01 + max(length(x.xz) - 0.65, 0.0);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float D = 0.03 - 0.01 * clamp(grainP, 0.0, 1.0);
    float wind = 0.3 + 0.7 * clamp(windP, 0.0, 1.0);
    float settle = smoothstep(0.0, 0.4, audioPhrasePos) * (1.0 - smoothstep(0.7, 1.0, audioPhrasePos));
    float blow = smoothstep(0.65, 1.0, audioPhrasePos);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    float orbit = 0.04 * sceneTime + 0.15 * audioAdvance;
    vec3 ro = 1.05 * vec3(sin(orbit), 0.25, -cos(orbit));
    vec3 fw = normalize(-ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 1.1 + rt * p.x + up * p.y);
    vec3 windDir = normalize(vec3(1.0, 0.3, 0.2));
    const mat3 SKEW = mat3(0.9287, 0.0000, -0.3709, 0.1778, 0.8776, 0.4452, 0.3255, -0.4794, 0.8150);
    vec3 col = vec3(0.0);
    float t = 0.6;
    for (int i = 0; i < 110; ++i) {
        vec3 x = ro + rd * t;
        // the grains are carried by the wind as it blows: look up the grain lattice where they came from
        vec3 xl = x - windDir * wind * blow * 0.8;
        vec3 dc = floor(SKEW * xl / D);
        float hd = fract(sin(dot(dc, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 gp = ((dc + 0.5 + 0.6 * (fract(hd * vec3(3.1, 5.7, 7.3)) - 0.5)) * D) * SKEW;
        vec3 dp = gp + windDir * wind * blow * 0.8;
        float d = length(cross(dp - ro, rd));
        float near = (1.0 - m) * exp(-pow(formD(gp, kA) / 0.02, 2.0)) + m * exp(-pow(formD(gp, kB) / 0.02, 2.0));
        float lit = exp(-pow(d / (0.16 * D), 2.0)) * near * max(settle, blow) * (1.0 - 0.6 * blow);
        col += famLight(fh, 0.3 + 0.4 * hd, 0.4) * lit * 0.7;
        t += D * 0.7;
    }
    col += famCol(fh, 0.45) * 0.012;
    finish(col);
}
