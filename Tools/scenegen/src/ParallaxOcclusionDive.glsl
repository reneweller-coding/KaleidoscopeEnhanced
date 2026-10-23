//@doc
 * @brief PARALLAX OCCLUSION DIVE: a surface with parallax occlusion: the photo lies as depth beneath a grid of thin ribs, and one glides into it -- looking through the grid at a relief that is deeper where the photo is dark, its
 * edges hiding one another as in a real relief, found by marching along the line of sight; the ribs are dark metal on the top level.  The view tips with the phase of the music, the depth of the relief follows the swell, and the camera sinks
 * slowly toward the surface.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the view tips (integrated)
 *   audioSwell      -> the depth of the relief
 *
 * Knobs: gridP (the fineness of the grid), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float N = 6.0 + 10.0 * clamp(gridP, 0.0, 1.0);
    float tilt = 0.25 * sin(0.2 * audioPhase + 0.05 * sceneTime);
    float turn = 0.4 * audioPhase * 0.2 + 0.02 * sceneTime;
    vec2 dir = 0.35 * vec2(cos(turn), sin(turn)) * (1.0 + tilt);
    float D = 0.15 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    vec2 uv = p * 0.8 + 0.5;
    float depth = 0.0;
    vec2 q = uv;
    float hitDepth = 0.0;
    for (int i = 0; i < 24; ++i) {
        float lay = float(i) / 24.0;
        q = uv + dir * lay * D;
        float surf = (1.0 - luma(imgLod(q, 1.8)));
        if (surf < lay) { hitDepth = lay; break; }
        hitDepth = lay;
    }
    vec3 c = imgLod(q, 0.7);
    vec2 gp = fract(p * N * 1.2) - 0.5;
    float rib = max(smoothstep(0.42, 0.46, abs(gp.x)), smoothstep(0.42, 0.46, abs(gp.y)));
    vec3 metal = vec3(0.05, 0.055, 0.06) + 0.15 * imgLod(uv, 5.0);
    vec3 col = c * (1.15 - 0.7 * hitDepth);
    finish(mix(col, metal, rib));
}
