//@doc
 * @brief HOLOGRAPHIC RECONSTRUCTION: a hologram -- a field of fine interference fringes that look like nothing --
 * and, as the viewing angle sweeps toward the reference beam's, the picture it stores rises out of the fringes:
 * the photo, first as a ghost in the moire, then whole, then dissolving again into fringes as the angle passes.
 * The fringes encode the photo as a phase (its brightness bends them), so the photo is always there, hidden.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the viewing angle sweeps (integrated): the photo rises and sinks with the music's advance
 *   audioSwell      -> the fringe density (finer in loud passages)
 *   audioKick       -> the fringes flash (light)
 *
 * Knobs: fringeP (the base fringe density), depthP (how strongly the photo bends the fringes), sweepP (the sweep's
 * speed), hueP.
//@params fringeP depthP sweepP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.7 + 0.5;
    float k = (120.0 + 160.0 * clamp(fringeP, 0.0, 1.0)) * (0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    // the object wave's phase: the photo's brightness (a phase hologram)
    float obj = luma(imgLod(uv, 1.5)) * (3.0 + 9.0 * clamp(depthP, 0.0, 1.0));
    float refAng = 0.6;
    float fringe = cos(k * p.x * sin(refAng) + k * 0.3 * p.y + obj);
    // the viewing angle sweeps; near the reference angle the fringes cancel into the stored picture
    float view = refAng + 0.5 * sin((0.05 + 0.1 * clamp(sweepP, 0.0, 1.0)) * sceneTime + 0.05 * audioPhase);
    float mis = (view - refAng) * k * 0.6;
    float recon = exp(-mis * mis * 0.02);                        // how well the picture reconstructs
    float beat = cos(k * p.x * (sin(view) - sin(refAng)) + obj); // the moire between viewing and recording
    vec3 photo = imgLod(uv, 0.3);
    vec3 tone = imgPalette(0.5 + 0.2 * beat + 0.03 * audioPhase);
    vec3 fr = mix(tone, vec3(0.9), 0.3) * (0.5 + 0.5 * fringe) * 0.6;
    vec3 ghost = photo * (0.5 + 0.5 * beat);
    vec3 col = mix(fr, mix(ghost, photo * 1.1, recon), smoothstep(0.0, 0.6, recon + 0.3 * (0.5 + 0.5 * beat)));
    col += mix(tone, vec3(1.0), 0.5) * pow(0.5 + 0.5 * fringe, 8.0) * 0.15 * (0.4 + clamp(audioKick, 0.0, 1.0)) * (1.0 - recon);
    finish(col);
}
