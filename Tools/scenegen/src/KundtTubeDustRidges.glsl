//@doc
 * @brief KUNDT TUBE DUST RIDGES: Kundt's tube: dust in a tube in which a sound wave stands arranges itself in ridges at the nodes; the photo is dusted in vertical ridges whose distance is half a wavelength.  The dust is pulled to the nodes, so the photo is compressed there into thin standing walls,
 * and between them it is stretched.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the wavelength glides with the harmony (integrated)
 *   audioSwell       -> the height of the ridges
 *
 * Knobs: sizeP (the base wavelength), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float lam = (0.1 + 0.12 * clamp(sizeP, 0.0, 1.0)) * (0.8 + 0.3 * sin(0.05 * audioHarmAdvance + 0.02 * sceneTime));
    float k = 6.2831853 / lam;
    float a = 0.55 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float x0 = p.x + 0.12 * sin(0.015 * sceneTime);
    float xp = x0 + a / k * sin(k * x0 * 0.5 * 2.0 + 0.0);
    float ridge = pow(1.0 - abs(sin(0.5 * k * x0)), 3.0);
    float dust = noise2(vec2(p.x * 400.0, p.y * 6.0 + 0.0 * sceneTime)) * 0.5 + noise2(vec2(p.x * 900.0, p.y * 40.0)) * 0.5;
    vec2 uv = vec2(xp, p.y + 0.01 * sin(40.0 * p.x)) * 0.85 + 0.5;
    vec3 c = imgLod(uv, 0.6);
    float shade = 0.45 + 0.75 * ridge;
    vec3 col = c * shade * (0.8 + 0.4 * dust);
    col = mix(col, vec3(luma(col)) * vec3(1.0, 0.95, 0.85), 0.2);
    finish(col * 1.15);
}
