//@doc
 * @brief LIGHT CURTAIN LAYERS: panels of gauze hang one behind another, lit in colour from the side, and fold and sway
 * in a draught: their folds gather and open as the music swells, and the light's colour turns with the harmony.  A
 * panel is a sheet whose fabric is gathered into folds across it; where the fabric folds steeply the gauze is seen edge
 * on and gathers more light, so every fold is a soft bright line; the folds' depth is the swell (smoothed in a small
 * field of the scene's own) and the draught bends them in slow waves down the panel.  The light comes from one side and
 * fades across; a chord change turns its colour to the other of two tones of the photo's family, smoothly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the folds gather and open (smoothed)
 *   audioHarmAdvance -> the light's colour turns between two tones with every chord change (smoothly)
 *   audioAdvance     -> the draught sways the panels (integrated)
 *
 * Knobs: foldP (how many folds), layerP (how many panels), hueP.
//@params foldP layerP
//@audio audioSwell audioHarmAdvance
//@state 1 1 60
//@body
/**  The state pass: the swell smoothed.
 *
 * @return
 *   x the smoothed swell, 0, 0, 1.
 **/
vec4 stateStep()
{
    float s = clamp(audioSwell, 0.0, 1.0);
    float old = stateFrame < 0.5 ? s : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, s, 0.03), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float sw = texelFetch(texState, ivec2(0, 0), 0).r;
    float draught = 0.15 * sceneTime + 0.6 * audioAdvance;
    float nf = 7.0 + 8.0 * clamp(foldP, 0.0, 1.0);
    float nl = floor(3.0 + 3.0 * clamp(layerP, 0.0, 1.0));
    float turnC = 0.5 - 0.5 * cos(3.14159265 * max(audioHarmAdvance, 0.0));
    vec3 lA = famLight(fh, 0.3, 0.3), lB = famLight(fh, 0.75, 0.3);
    vec3 light = mix(lA, lB, turnC);
    vec3 col = famCol(fh, 0.4) * 0.02;
    for (int k = 5; k >= 0; --k) {
        float fk = float(k);
        if (fk >= nl) continue;
        float z = 1.0 + 0.6 * fk;
        vec2 q = p * z;
        float bend = 0.25 * sin(1.3 * q.y + draught * (0.8 + 0.1 * fk) + 2.0 * fk) + 0.1 * sin(3.1 * q.y - 0.7 * draught + fk);
        float ph = nf * (q.x + bend) + 1.7 * fk;
        float amp = 0.35 + 0.55 * sw;
        float slope = amp * cos(ph);                                   // the fabric's slope across the fold
        float edgeOn = 1.0 / pow(1.0 - 0.97 * slope * slope, 0.75);         // seen edge on, the gauze gathers light
        float side = 0.45 + 0.55 * (1.0 - smoothstep(-1.6, 1.6, q.x - 0.4 * fk));
        float hem = smoothstep(-0.6 * z - 0.1, -0.55 * z, q.y);       // the panel's lower hem
        vec3 c = light * (0.03 + 0.35 * (edgeOn - 1.0)) * side * hem * (1.0 - 0.1 * fk);
        col = col * 0.82 + c;
    }
    finish(famExpose(col, 1.20, 1.00, 0.00, fh));
}
