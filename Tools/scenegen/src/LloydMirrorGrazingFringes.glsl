//@doc
 * @brief LLOYD MIRROR GRAZING FRINGES: Lloyd's mirror: a light beam and its mirror image at a grazing mirror make fringes with a dark middle; the picture shows fringes that start dark at an edge and shift with the angle.  The intensity is four times the square of a sine that depends on the height over the mirror
 * divided by the distance, so the fringes fan out from the mirror's end; the photo colours the interference field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the angle of the source moves (integrated)
 *   audioSpread  -> the number of fringes (the source's height over the mirror) (smoothed)
 *
 * Knobs: sizeP (the wavelength), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float h = 0.02 + 0.03 * clamp(audioSpread, 0.0, 1.0) + 0.003 * sin(0.03 * audioAdvance + 0.04 * sceneTime);
    float lam = 0.004 + 0.004 * clamp(sizeP, 0.0, 1.0);
    vec3 col = vec3(0.0);
    float tilt = 0.12 * sin(0.015 * audioAdvance + 0.02 * sceneTime);
    vec2 q = rot2(tilt) * p;
    float x = q.x + 0.5 * asp + 0.02;
    float y = q.y;
    float ay = abs(y);
    float I = pow(sin(3.1415927 * (2.0 * h * ay) / (lam * max(x, 0.03))), 2.0);
    float fade = smoothstep(0.0, 0.15, x) * exp(-ay * 0.6);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    float mirror = 1.0 - smoothstep(0.0, 0.004, abs(y));
    col = c * (0.1 + 1.15 * I) * fade + imgLod(p * 0.85 + 0.5, 2.5) * 0.08;
    col += vec3(0.9, 0.85, 0.7) * mirror * 0.4;
    finish(col * 1.15);
}
