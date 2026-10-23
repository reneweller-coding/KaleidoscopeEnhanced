//@doc
 * @brief SOLID TEXTURE SLICE FLIGHT: solid texture: the photo is continued as a three-dimensional texture, and the picture is a slice through it that slowly moves through the volume; new structures appear where they are not in the photo.  A three-dimensional noise bends the photo's coordinates, a second, turned and
 * scaled copy of the photo comes and goes with the same noise, and the slice depth runs on.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the slice moves through the volume (integrated)
 *   audioSwell   -> how far the volume bends the photo
 *
 * Knobs: sizeP (the scale of the volume), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float z = 0.04 * audioAdvance + 0.06 * sceneTime;
    float sc = 1.5 + 2.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float A = 0.12 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    vec2 zo = vec2(cos(z), sin(z)) * 2.0 + vec2(0.5 * z, 0.3 * z);
    vec2 w = vec2(fbm(p * sc + zo), fbm(p * sc + 5.0 - zo.yx)) - 0.5;
    vec2 uv = p * (0.85 + 0.12 * sin(z)) + 0.5 + A * w * 2.0;
    vec3 a = imgLod(uv, 0.6);
    float m = smoothstep(0.35, 0.65, fbm(p * sc * 0.8 + 11.0 + vec2(cos(1.3 * z), sin(1.3 * z)) * 2.0));
    vec3 b = imgLod(rot2(1.0 + 0.5 * z) * (p * 1.3) * 0.85 + 0.5 + 0.1 * w, 0.6);
    vec3 col = mix(a, b * vec3(0.95, 1.05, 1.1), m);
    finish(col * 1.1);
}
