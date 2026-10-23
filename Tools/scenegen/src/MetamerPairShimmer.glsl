//@doc
 * @brief METAMER PAIR SHIMMER: metamers: two colours that look alike in one light and unlike in another; the picture shows the photo in two illuminants that merge into each other.  A warm light (tungsten) and a cool one (daylight) are applied to the photo as colour transforms that agree on greys and part on saturated colours;
 * a diagonal border slides across the picture, and in a band round it the two lights flicker against each other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the illuminant glides with the key (integrated)
 *   audioAdvance     -> the border slides (integrated)
 *
 * Knobs: sizeP (the width of the shimmering band), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    float g = luma(c);
    vec3 sat = c - vec3(g);
    float k = 0.5 + 0.5 * sin(0.06 * audioHarmAdvance + 0.03 * sceneTime);
    vec3 warm = vec3(g) * vec3(1.18, 1.0, 0.72) + sat * vec3(1.3, 0.9, 0.5) * (0.6 + 0.8 * k);
    vec3 cool = vec3(g) * vec3(0.86, 1.0, 1.25) + sat * vec3(0.7, 1.0, 1.5) * (1.6 - 0.8 * k);
    float ang = 0.6;
    float pos = 0.4 * sin(0.015 * audioAdvance + 0.02 * sceneTime);
    float d = dot(p, vec2(cos(ang), sin(ang))) - pos;
    float wd = 0.08 + 0.18 * clamp(sizeP, 0.0, 1.0);
    float m = smoothstep(-wd, wd, d);
    float flick = 0.5 + 0.5 * sin(60.0 * d + 4.0 * sceneTime);
    float inb = 1.0 - smoothstep(0.0, wd, abs(d));
    float mm = mix(m, smoothstep(0.35, 0.65, flick), 0.55 * inb);
    vec3 col = mix(warm, cool, mm);
    finish(clamp(col, 0.0, 1.5) * 1.05);
}
