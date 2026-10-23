//@doc
 * @brief ASANOHA HEMP STAR: asanoha, the hemp-leaf star: a star of triangles with six axes (here eight triangles to a square); each triangle shows the photo in one of its mirror images, and the star opens and closes like a blossom.  The photo is folded into one triangle of each cell and mirrored into
 * the others, thin lines run along the folds, and the zoom into the photo breathes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the opening: the zoom into the folded photo breathes (integrated)
 *   audioSwell       -> the brightness of the fold lines
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.2 + 0.16 * clamp(sizeP, 0.0, 1.0);
    S *= 1.0 + 0.1 * sin(0.04 * sceneTime);
    vec2 q = p / S;
    vec2 ci = floor(q + 0.5);
    vec2 f = q - ci;
    vec2 a = abs(f);
    float mx = max(a.x, a.y);
    float mn = min(a.x, a.y);
    float z = 0.7 + 0.4 * (0.5 + 0.5 * sin(0.08 * audioHarmAdvance + 0.03 * sceneTime));
    vec2 uv = vec2(mx, mn) * z * 0.5 * (1.0 + 0.0) + 0.5 + 0.03 * vec2(sin(0.5 * ci.x + 0.02 * sceneTime), cos(0.5 * ci.y));
    vec3 c = imgLod(uv, 0.6);
    float l1 = 1.0 - smoothstep(0.0, 0.025, abs(mx - mn));
    float l2 = 1.0 - smoothstep(0.0, 0.025, mn);
    float l3 = 1.0 - smoothstep(0.0, 0.025, abs(mx - 0.5));
    float l4 = 1.0 - smoothstep(0.0, 0.03, abs(mx + mn - 0.5) * 0.8);
    float lines = max(max(l1, l2), max(l3, l4 * 0.7));
    float tri = mod(floor(mn / max(mx, 1e-3) * 2.0), 2.0);
    vec3 col = c * (0.75 + 0.35 * tri);
    col = mix(col, vec3(0.95, 0.93, 0.85), lines * (0.2 + 0.3 * clamp(audioSwell, 0.0, 1.0)));
    finish(col * 1.1);
}
