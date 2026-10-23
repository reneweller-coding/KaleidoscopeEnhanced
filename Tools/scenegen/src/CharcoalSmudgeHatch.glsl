//@doc
 * @brief CHARCOAL SMUDGE HATCH: a charcoal drawing: the photo as hatching in charcoal, with smudged areas and lifted lights; the hatching wanders in strips and is smudged with a finger.  Two sets of strokes (the second only in the dark places), a soft smear of the same darkness taken from a blurred copy, the
 * paper's tooth that catches the charcoal, and an eraser that lifts the lights.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the direction of the hatching turns (integrated)
 *   audioSwell   -> the smudging (the share of the soft smear)
 *
 * Knobs: sizeP (the stroke spacing), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    vec2 uv = p * 0.85 + 0.5;
    vec3 c = imgLod(uv, 0.8);
    float l = luma(c);
    float dark = clamp(1.0 - l * 1.1, 0.0, 1.0);
    float ang = 0.7 + 0.01 * audioAdvance + 0.015 * sceneTime;
    float sp = 55.0 + 60.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float s1 = dot(p, vec2(cos(ang), sin(ang))) * sp + 1.2 * fbm(p * 5.0);
    float s2 = dot(p, vec2(cos(ang + 0.95), sin(ang + 0.95))) * sp * 0.9 + 1.2 * fbm(p * 5.0 + 4.0);
    float w1 = pow(dark, 1.2) * 0.9;
    float st1 = 1.0 - smoothstep(w1 * 0.5, w1 * 0.5 + 0.12, abs(fract(s1) - 0.5));
    float w2 = pow(max(dark - 0.35, 0.0) * 1.5, 1.3) * 0.9;
    float st2 = (1.0 - smoothstep(w2 * 0.5, w2 * 0.5 + 0.12, abs(fract(s2) - 0.5))) * step(0.001, w2);
    float tooth = noise2(fc / px * 0.7) * 0.6 + noise2(fc / px * 1.9 + 5.0) * 0.4;
    float catchc = smoothstep(0.25, 0.75, tooth + 0.2 * dark);
    float hatch = max(st1, st2) * catchc;
    float smear = dark * 0.55 * smoothstep(0.1, 0.7, imgLod(uv, 3.5).r * 0.0 + 1.0 - luma(imgLod(uv, 3.5)));
    float sm = 0.2 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float ink = clamp(hatch * (0.6 + 0.5 * dark) + smear * sm * (0.5 + 0.5 * tooth), 0.0, 1.0);
    float lift = smoothstep(0.78, 0.95, l);
    ink *= 1.0 - lift * 0.8;
    vec3 paper = vec3(0.93, 0.9, 0.84) * (0.93 + 0.1 * tooth);
    vec3 charcoal = vec3(0.06, 0.06, 0.07) + 0.12 * c;
    finish(mix(paper, charcoal, ink));
}
