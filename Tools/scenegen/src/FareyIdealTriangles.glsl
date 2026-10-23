//@doc
 * @brief FAREY IDEAL TRIANGLES: the Farey diagram in the upper half-plane: ideal triangles between fractions, each the same hyperbolic triangle seen under the modular group, in every one the photo, ever narrower toward the real axis
 * at the bottom of the picture where the fractions crowd.  The picture is the modular tessellation: every point is moved back into the fundamental domain by translations and inversions, and the photo is read there; thin bright lines
 * are the domain's walls.  The domain's translation wanders with the drive of the music, the depth of the reduction follows the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the half-plane slides along the real axis (integrated)
 *   audioSpread     -> the depth of the reduction (finer triangles fading in)
 *
 * Knobs: scaleP (the scale of the half-plane), hueP.
//@params scaleP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float sc = 1.2 + 2.5 * clamp(scaleP, 0.0, 1.0);
    vec2 z = vec2(p.x * sc + 0.05 * audioAdvance + 0.01 * sceneTime, (p.y + 0.5 + 0.01) * sc);
    float flip = 0.0;
    float steps = 0.0;
    float wall = 1.0;
    int D = 6 + int(8.0 * clamp(audioSpread, 0.0, 1.0));
    for (int i = 0; i < 14; ++i) {
        if (i >= D) break;
        z.x -= floor(z.x + 0.5);
        float n2 = dot(z, z);
        if (n2 < 1.0) { z = vec2(-z.x, z.y) / n2; flip += 1.0; }
        steps += 1.0;
    }
    z.x -= floor(z.x + 0.5);
    wall = min(abs(abs(z.x) - 0.5), abs(length(z) - 1.0));
    vec2 uv = vec2(0.5 + z.x * 0.9, 0.5 - (z.y - 1.3) * 0.5);
    vec3 c = imgLod(uv, 0.8 + 0.1 * steps);
    float line = smoothstep(0.02, 0.0, wall);
    float depth = smoothstep(0.0, 0.05, p.y + 0.5);
    finish((c * (0.85 + 0.15 * mod(flip, 2.0)) + 0.35 * line) * mix(0.5, 1.1, depth));
}
