#version 330 core
out vec4 fragColor;
/**
 * @file KluverFormConstants.frag
 * @brief KLUVER FORM CONSTANTS: the four geometric hallucination forms --
 * tunnel, spiral, lattice, cobweb -- as one continuously morphing field.
 * Each form is a phase function over the retinal (log-polar) plane; the
 * blend between them is picked by the arousal axis and drifts on the scene
 * clock, always by smooth weights, never by a switch.  The photo is the
 * colour source: the forms are stripes of it.  The whole field flows
 * steadily toward (or from) the centre; the camera never moves.
 *
 * Audio Reactivity:
 *   audioArousal -> which forms dominate (slow blend)
 *   sceneAdvance -> the flow and the drift of the blend (continuous)
 *   audioKick    -> stripe brightness (light)
 *   audioSwell   -> stripe contrast (slow)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: densP (stripe density), twistP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioArousal;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float densP;
uniform float twistP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float dens = 6.0 + 8.0 * clamp(densP, 0.0, 1.0);
    float twist = 0.5 + 2.0 * clamp(twistP, 0.0, 1.0);
    float flow = sceneAdvance * 0.5 + sceneTime * 0.08;

    // Retinal coordinates: log-polar (the cortical map).
    float r = max(length(p), 1e-3);
    float th = atan(p.y, p.x);
    float lr = log(r);
    // The four form constants as phase fields (each periodic in lr/th):
    //   tunnel:  stripes in lr (concentric rings) flowing inward
    //   spiral:  stripes in lr + twist*th
    //   lattice: a checker of lr and th
    //   cobweb:  radial spokes and rings together
    float tunnel  = sin(lr * dens - flow);
    float spiral  = sin(lr * dens + th * twist * 3.0 - flow);
    float lattice = sin(lr * dens - flow) * sin(th * 8.0 + flow * 0.3);
    float cobweb  = max(sin(th * 12.0), sin(lr * dens * 0.7 - flow * 0.7));
    // Blend weights: arousal picks the family (calm -> tunnel/cobweb,
    // excited -> spiral/lattice), drifting on the scene clock; all four
    // weights stay positive and sum to one.
    float ar = clamp(audioArousal, 0.0, 1.0);
    float d1 = 0.5 + 0.5 * sin(sceneAdvance * 0.1 + sceneTime * 0.02);
    float d2 = 0.5 + 0.5 * sin(sceneAdvance * 0.07 + 1.7);
    vec4 w = vec4((1.0 - ar) * (0.4 + 0.6 * d1),
                  ar * (0.4 + 0.6 * d2),
                  ar * (0.4 + 0.6 * (1.0 - d1)),
                  (1.0 - ar) * (0.4 + 0.6 * (1.0 - d2)));
    w += 0.08;
    w /= (w.x + w.y + w.z + w.w);
    float field = w.x * tunnel + w.y * spiral + w.z * lattice + w.w * cobweb;
    // Stripes: the field thresholded softly; contrast on the swell.
    float contrast = 0.35 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float stripe = smoothstep(-0.2, 0.2, field);
    // Colour: the photo sampled by the field phase and the angle.
    vec2 suv = vec2(fract(lr * 0.15 - flow * 0.02), fract(th / 6.2831853 + 0.5));
    vec3 photo = img(suv);
    vec3 palA = imgPalette(hue * 0.159 + 0.0);
    vec3 palB = imgPalette(hue * 0.159 + 0.5);
    vec3 col = mix(palA * 0.4, photo * 1.2 + palB * 0.2, stripe);
    col = mix(vec3(dot(col, vec3(0.333))), col, 0.7 + 0.3 * contrast);
    col *= 0.6 + 0.8 * contrast * stripe + 0.3;
    // The stripe edges glow on the kick.
    float edge = exp(-abs(field) * 6.0);
    col += imgPalette(hue * 0.159 + 0.9) * edge * (0.1 + 0.7 * audioKick);
    // Central fovea: bright, soft.
    col += palB * exp(-r * 4.0) * 0.4;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
