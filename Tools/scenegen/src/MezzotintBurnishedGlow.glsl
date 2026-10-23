//@doc
 * @brief MEZZOTINT BURNISHED GLOW: mezzotint: a roughened plate that is smoothed with a burnisher; light tones are polished, dark ones stay velvety; the photo sets the polish, and the roughness breathes.  The plate is a dense field of fine pits that hold ink; where the photo is light the pits are burnished away, and
 * the velvet black shows the grain of the rocker.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness -> the roughness of the plate (the grain's size and depth)
 *   audioSwell     -> the polish (how far the lights are burnished)
 *
 * Knobs: sizeP (the grain size), hueP.
//@params sizeP
//@audio audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    vec2 uv = p * 0.85 + 0.5 + 0.015 * vec2(sin(0.04 * sceneTime), cos(0.03 * sceneTime));
    vec3 c = imgLod(uv, 0.8);
    float l = luma(c);
    float gs = 0.8 + 1.6 * clamp(sizeP, 0.0, 1.0) + 1.0 * clamp(audioRoughness, 0.0, 1.0);
    float grain = noise2(fc / px / gs * 1.1) * 0.5 + noise2(fc / px / gs * 2.7 + 5.0) * 0.5;
    float rock = noise2(vec2(dot(fc / px, vec2(0.6, 0.8)) / gs * 0.9, dot(fc / px, vec2(-0.8, 0.6)) / gs * 0.3));
    float polish = smoothstep(0.15, 0.9, l * (0.9 + 0.5 * clamp(audioSwell, 0.0, 1.0)));
    float pits = smoothstep(0.35, 0.75, grain * 0.8 + rock * 0.2 + 0.25 * (1.0 - polish));
    float ink = (1.0 - polish) * (0.5 + 0.5 * pits) + (1.0 - polish) * 0.25;
    vec3 paper = vec3(0.95, 0.93, 0.87);
    vec3 inkc = mix(vec3(0.03, 0.025, 0.03), c * 0.2, 0.25);
    vec3 col = mix(paper, inkc, clamp(ink * 1.1, 0.0, 1.0));
    col += vec3(1.0, 0.95, 0.85) * polish * polish * 0.08;
    finish(col * 1.05);
}
