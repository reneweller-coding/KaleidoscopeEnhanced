#version 330 core
out vec4 fragColor;
/**
 * @file VacuumDecayBubble.frag
 * @brief VACUUM DECAY BUBBLE: a bubble of true vacuum drifts through space
 * and rewrites the physics inside it.  Outside, a starfield and the photo
 * as a nebula; inside the wall the same sky with the constants changed --
 * colours inverted toward the palette, space refracted, stars split into
 * spectra, the nebula's structure at another scale.  The wall itself is a
 * thin refracting shell with chromatic dispersion.  The bubble's radius
 * grows with the build-up (seconds-slow) and eases back after the release;
 * its centre drifts on the scene clock.  Inside and outside blend across
 * the wall, so nothing ever cuts.  The camera never moves.
 *
 * Audio Reactivity:
 *   audioBuildUp  -> bubble radius (slow)
 *   sceneAdvance  -> the bubble drifts, the sky turns slowly
 *   audioDrop     -> the wall flashes (light)
 *   audioKick     -> the inside pulses (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: sizeP (base radius), dispP (dispersion), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBuildUp;
uniform float audioDrop;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sizeP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// The sky seen through the current physics: stars (round), nebula (photo).
vec3 sky(vec2 q, float alt, float hue)
{
    // alt = 0 outside, 1 inside: scale and tint of the nebula change.
    vec2 nuv = fract(q * mix(0.3, 0.55, alt) + 0.5 + vec2(sceneAdvance * 0.003, 0.0));
    vec3 neb = img(nuv);
    vec3 nebOut = neb * imgPalette(hue * 0.159 + 0.6) * 1.4;
    vec3 nebIn  = (1.0 - neb) * imgPalette(hue * 0.159 + 0.1) * 1.6;
    vec3 col = mix(nebOut, nebIn, alt) * 0.5;
    vec2 su = q * 60.0;
    vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
    float hs = hash21(cell);
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float star = smoothstep(0.16, 0.02, length(f - off * 0.6)) * step(0.972, hs) * (0.5 + 0.8 * hash21(cell + 9.9));
    // Inside, stars split into small spectra (dispersion): three offset copies.
    vec3 starCol = vec3(star);
    if (alt > 0.001)
    {
        float sR = smoothstep(0.16, 0.02, length(f - off * 0.6 - vec2(0.05, 0.0) * alt)) * step(0.972, hs);
        float sB = smoothstep(0.16, 0.02, length(f - off * 0.6 + vec2(0.05, 0.0) * alt)) * step(0.972, hs);
        starCol = mix(starCol, vec3(sR, star, sB) * (0.5 + 0.8 * hash21(cell + 9.9)), alt);
    }
    return col + starCol;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float disp = 0.02 + 0.04 * clamp(dispP, 0.0, 1.0);
    // Radius: base plus the build-up (slow), plus a slow breath.
    float R = (0.22 + 0.18 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.9 * clamp(audioBuildUp, 0.0, 1.0)) + 0.03 * sin(sceneTime * 0.3);
    vec2 c = vec2(0.25 * sin(sceneAdvance * 0.06), 0.15 * cos(sceneAdvance * 0.045));

    // The sky turns slowly.
    float rot = sceneAdvance * 0.02;
    vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p;

    float d = length(p - c) - R;
    float inside = 1.0 - smoothstep(-0.02, 0.02, d);
    // Refraction across the wall: a lens bends the sky near the rim, with
    // dispersion (three channels, three strengths).
    float rim = exp(-abs(d) * 18.0);
    vec2 dir = normalize(p - c + 1e-5);
    vec3 col;
    {
        vec2 qR = q - dir * rim * disp * 0.7;
        vec2 qG = q - dir * rim * disp * 1.0;
        vec2 qB = q - dir * rim * disp * 1.4;
        col = vec3(sky(qR, inside, hue).r, sky(qG, inside, hue).g, sky(qB, inside, hue).b);
    }
    // The wall: a thin bright shell, flashing on the drop; the inside pulses
    // faintly on the kick.
    vec3 wallCol = imgPalette(hue * 0.159 + 0.9);
    col += wallCol * exp(-abs(d) * 60.0) * (0.6 + 2.0 * clamp(audioDrop, 0.0, 1.0));
    col += wallCol * exp(-abs(d) * 10.0) * 0.12;
    col += imgPalette(hue * 0.159 + 0.1) * inside * 0.15 * audioKick;
    col *= 0.8 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
