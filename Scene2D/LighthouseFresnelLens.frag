#version 330 core
out vec4 fragColor;
/**
 * @file LighthouseFresnelLens.frag
 * @brief LIGHTHOUSE FRESNEL LENS: inside the lantern room, looking out
 * through the great Fresnel lens.  Concentric prism rings -- each a stepped
 * refracting band -- bend the world outside (the photo as the night sea and
 * sky) into a fan of stretched, dispersed images; the lens assembly turns
 * steadily on the scene clock as a lighthouse lens does, and where the
 * bull's-eye passes the lamp the beam floods the frame.  Dispersion splits
 * the light into colour at every prism edge.  The camera never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance -> lens rotation (continuous)
 *   audioSwell   -> lamp brightness (slow)
 *   audioKick    -> the prism edges flash (light)
 *   audioLevel   -> brightness
 *   audioHigh    -> dispersion strength (light/colour)
 *
 * Per-activation variety: ringsP (prism count), dispP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioHigh;
uniform float audioChromaHue;
uniform float audioValence;

uniform float ringsP;
uniform float dispP;
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

// The world outside the lens, as seen along a (refracted) direction.
vec3 world(vec2 dir, float hue)
{
    vec2 uv = fract(vec2(dir.x * 0.25 + 0.5 + sceneAdvance * 0.003, dir.y * 0.4 + 0.5));
    vec3 c = img(uv) * imgPalette(hue * 0.159 + 0.6) * 1.6;
    // The horizon line and a moon.
    c += imgPalette(hue * 0.159 + 0.05) * exp(-abs(dir.y + 0.1) * 12.0) * 0.4;
    c += vec3(1.0, 0.95, 0.85) * exp(-length(dir - vec2(0.6, 0.5)) * 8.0) * 0.8;
    return c;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float rings = 6.0 + 8.0 * clamp(ringsP, 0.0, 1.0);
    float disp = (0.008 + 0.018 * clamp(dispP, 0.0, 1.0)) * (0.7 + 0.5 * clamp(audioHigh * 2.0, 0.0, 1.0));
    float rot = sceneAdvance * 0.15 + sceneTime * 0.03;

    // The lens: concentric prism rings about a bull's-eye that turns with the
    // assembly (the bull's-eye is off-centre, so its passing is an event).
    vec2 eye = vec2(0.35 * cos(rot), 0.2 * sin(rot));
    vec2 q = p - eye;
    float r = length(q);
    float ringIdx = floor(r * rings);
    float within = fract(r * rings);                    // position across one prism
    // Each prism ring deflects radially by a sawtooth (the Fresnel profile):
    // the deflection grows across the prism and resets at the step.
    vec2 rdir = q / max(r, 1e-4);
    float deflect = (within - 0.5) * 0.35 + ringIdx * 0.02;
    // Sample the world three times with dispersion.
    vec3 col;
    col.r = world(p + rdir * (deflect - disp), hue).r;
    col.g = world(p + rdir * deflect, hue).g;
    col.b = world(p + rdir * (deflect + disp), hue).b;
    // Prism edges: bright refracting steps, flashing on the kick.
    float edge = exp(-min(within, 1.0 - within) * rings * 3.0);
    col += imgPalette(hue * 0.159 + 0.9) * edge * (0.15 + 0.6 * audioKick);
    // Glass tint and the brass frame ribs.
    col *= mix(vec3(1.0), vec3(0.8, 0.95, 1.0), 0.4);
    float a = atan(q.y, q.x);
    float rib = exp(-min(fract(a * 1.9098), 1.0 - fract(a * 1.9098)) * 60.0) * step(0.15, r);
    col = mix(col, vec3(0.45, 0.35, 0.15), rib * 0.8);
    // The lamp: when the bull's-eye lines up with the lamp behind (the lens
    // turning), the beam floods the frame -- a slow, smooth passage.
    float beam = exp(-r * 3.0) * (0.3 + 1.2 * clamp(audioSwell, 0.0, 1.0));
    col += vec3(1.0, 0.95, 0.8) * beam * 0.9;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
