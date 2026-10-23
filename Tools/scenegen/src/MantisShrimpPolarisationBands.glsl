//@doc
 * @brief MANTIS SHRIMP POLARISATION BANDS: mantis shrimp eyes: several bands that see colour and polarisation separately; in the picture the bands lie as stripes on top of each other, and each shows the photo in another channel mix.  Twelve bands slide slowly past each other; each has its own rotation of the
 * colour channels, its own contrast like a polariser at another angle, and thin dark joints.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the bands slide (integrated)
 *   audioSwell   -> the differences between the bands' channel mixes
 *
 * Knobs: sizeP (the number of bands), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    vec2 p = screenP();
    float N = 6.0 + 8.0 * clamp(sizeP, 0.0, 1.0);
    float t = 0.01 * audioAdvance + 0.015 * sceneTime;
    float y = q.y * N + t * 0.0;
    float k = floor(y);
    float fy = fract(y);
    float h = hash21(vec2(k, 4.0));
    float sl = (h - 0.5) * 2.0 * 0.3 * (0.2 * audioAdvance + 0.6 * sceneTime) * 0.1;
    vec3 c = imgLod((p + vec2(sl, 0.0)) * 0.85 + 0.5, 0.6);
    float d = (0.3 + 0.7 * clamp(audioSwell, 0.0, 1.0));
    float a = 6.2831853 * h * d;
    mat3 M = mat3(1.0 - d * 0.5, 0.0, 0.0, 0.0, 1.0 - d * 0.5, 0.0, 0.0, 0.0, 1.0 - d * 0.5)
           + d * 0.5 * mat3(0.0, cos(a), sin(a), sin(a), 0.0, cos(a), cos(a), sin(a), 0.0);
    vec3 cc = M * c;
    float ang = 3.1415927 * h + 0.2 * sin(0.2 * sceneTime + k);
    float pol = 0.5 + 0.5 * cos(2.0 * (ang - 1.0) + 3.0 * luma(c));
    cc *= 0.6 + 0.7 * mix(1.0, pol, d);
    float edge = smoothstep(0.0, 0.05, fy) * (1.0 - smoothstep(0.95, 1.0, fy));
    finish(cc * (0.3 + 0.7 * edge) * 1.25);
}
