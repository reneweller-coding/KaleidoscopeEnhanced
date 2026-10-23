//@doc
 * @brief E-INK PARTICLE DRIFT: electronic paper: the photo is made of white and black particles in microcapsules that move slowly in a few grey levels; the earlier state stays behind as a ghost and dissolves in clouds, so the picture is always
 * reached in a streaky, never in a finished way.  The grey levels are the paper's, the colour is only a trace on top.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of grey levels glides between four and sixteen
 *   audioSwell       -> how far the particles have settled (the ghost's strength)
 *
 * Knobs: sizeP (the size of the capsules), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
/**  Soft quantisation of a brightness to n steps.
 *
 * @param l  The brightness. (in)
 * @param n  The number of steps. (in)
 *
 * @return
 *   The quantised brightness.
 **/
float quantL(float l, float n)
{
    float x = l * (n - 1.0);
    return (floor(x) + smoothstep(0.35, 0.65, fract(x))) / (n - 1.0);
}
void main()
{
    vec2 p = screenP();
    vec2 fc = gl_FragCoord.xy;
    vec2 uv = p * 0.8 + 0.5;
    float lv = 4.0 + 12.0 * (0.5 + 0.5 * sin(0.1 * audioHarmAdvance + 0.03 * sceneTime));
    vec3 c = imgLod(uv, 0.5);
    float l = luma(c);
    vec2 gh = 0.03 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    float lg = luma(imgLod(uv + gh, 1.5));
    float q = quantL(l, lv);
    float qg = quantL(lg, lv);
    float S = (3.0 + 4.0 * clamp(sizeP, 0.0, 1.0)) * resolution.y / 270.0;
    float cap = noise2(fc / S + 0.2 * sceneTime * vec2(1.0, -0.6));
    float cloud = fbm(p * 3.0 + 0.04 * sceneTime);
    float ghost = (0.25 + 0.4 * clamp(audioSwell, 0.0, 1.0)) * smoothstep(0.35, 0.7, cloud);
    float g = mix(q, qg, ghost);
    g += (cap - 0.5) * 0.12;
    vec3 paper = vec3(0.93, 0.92, 0.88);
    vec3 col = paper * (0.06 + 0.94 * g);
    col = mix(col, c * (0.2 + 0.8 * g) * 1.15, 0.22);
    finish(col);
}
