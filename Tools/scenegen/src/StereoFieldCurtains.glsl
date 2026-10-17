//@doc
 * @brief STEREO FIELD CURTAINS: the stereo image as a pair of curtains made of the photo -- what sounds on the left sets
 * the left curtain's folds swaying, what sounds on the right the right one's, mirrored about the middle; the balance
 * between the two draws the parting to one side, and the stereo width opens the gap between them.  The folds catch
 * the light like heavy cloth; behind the parting glows the photo, blurred and deep.
 *
 * Audio Reactivity (structure, not only light):
 *   audioStereoL    -> the left curtain's folds: the left channel's energy over its three bands (smoothed on the state
 *                      pass)
 *   audioStereoR    -> the right curtain's folds, the same for the right channel
 *   audioStereo     -> the stereo width: how far the curtains part
 *   audioKick       -> the folds' sheen flashes (light)
 *
 * Knobs: foldsP (how many folds), swayP (how far they sway), photoP (photo share), hueP.
//@params foldsP swayP photoP
//@audio audioStereoL audioStereoR audioStereo audioKick
//@state 3 1 60
//@body
/**  The state pass: the left level, the right level and the width, each smoothed over about a second.
 *
 * @return
 *   The smoothed value, 0, 0, 1.
 **/
vec4 stateStep()
{
    int i = int(gl_FragCoord.x);
    float v = clamp(i == 0 ? dot(audioStereoL, vec3(0.3333333)) : (i == 1 ? dot(audioStereoR, vec3(0.3333333)) : audioStereo), 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(v, 0.0, 0.0, 1.0);
    return vec4(mix(texelFetch(texState, ivec2(i, 0), 0).r, v, 0.03), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float L = texelFetch(texState, ivec2(0, 0), 0).r, R = texelFetch(texState, ivec2(1, 0), 0).r;
    float width = texelFetch(texState, ivec2(2, 0), 0).r;
    float bal = clamp((R - L) * 1.5, -0.6, 0.6);
    float centre = 0.25 * bal;                                  // the parting drawn toward the louder side
    float gap = 0.03 + 0.25 * width;
    bool left = p.x < centre;
    float lvl = left ? L : R;
    float xr = left ? centre - p.x : p.x - centre;              // the distance from the parting, mirrored
    float folds = 9.0 + 10.0 * clamp(foldsP, 0.0, 1.0);
    float sway = (0.3 + 0.7 * clamp(swayP, 0.0, 1.0)) * (0.3 + 1.2 * lvl);
    float t = 0.6 * sceneTime + (left ? 0.0 : 2.0);
    // the cloth: folds whose phase sways downward like heavy fabric, gathered toward the parting
    float gather = smoothstep(gap, gap + 0.25, xr);
    float ph = folds * xr * (0.6 + 0.4 * gather) + sway * sin(t + 2.0 * p.y + 3.0 * xr) + 0.3 * sway * sin(1.7 * t - 3.0 * p.y);
    float h = sin(ph), dh = cos(ph);
    vec3 n = normalize(vec3(-dh * folds * 0.09, 0.0, 1.0));
    float diff = 0.25 + 0.85 * max(dot(n, normalize(vec3(left ? 0.5 : -0.5, 0.3, 0.8))), 0.0);
    float sheen = pow(max(dot(n, normalize(vec3(0.0, 0.2, 1.0))), 0.0), 40.0) * (0.3 + 0.7 * clamp(audioKick, 0.0, 1.0));
    vec2 uv = vec2((left ? -xr : xr) + centre + 0.012 * h, p.y) * 0.55 + 0.5;
    vec3 cloth = imgLod(uv, 0.5);
    vec3 tone = imgPalette((left ? 0.15 : 0.55) + 0.03 * audioPhase);
    vec3 c = mix(cloth * tone * 1.6, cloth * 1.2, 0.55 + 0.4 * clamp(photoP, 0.0, 1.0)) * diff * (0.75 + 0.25 * h) + sheen * 0.4;
    // behind the parting: the photo, deep and soft
    vec3 back = imgLod(p * 0.4 + 0.5, 3.5) * 0.45;
    float cover = smoothstep(gap - 0.01, gap + 0.01, xr);
    vec3 col = mix(back, c, cover);
    finish(col);
}
