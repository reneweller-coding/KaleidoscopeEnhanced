#version 330 core
out vec4 fragColor;
/**
 * @file DropCountdownVortex.frag
 * @brief DROP COUNTDOWN VORTEX: a vortex that counts down to the drop.  The
 * host predicts the next 8-bar boundary (audioPhraseLeft, seconds); rings of
 * the vortex are spaced one beat apart and slide toward the throat as the
 * boundary nears, tightening and heating with the build-up -- and on the
 * drop they snap shut and the vortex blows out into a bright tube.  When no
 * tempo is known the vortex just turns and breathes with the level.
 *
 * Audio Reactivity:
 *   audioPhraseLeft -> ring spacing/speed (the countdown)
 *   audioBuildUp    -> the throat narrows and the colour heats
 *   audioDrop       -> the snap and blow-out
 *   audioBeatPhase  -> each ring pulses on its beat
 *   audioBass       -> throat glow
 *   sceneAdvance    -> vortex rotation, continuous
 *
 * Per-activation variety: twistP (arm twist), throatP (throat size), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioPhraseLeft;
uniform float audioPhrasePos;
uniform float audioBuildUp;
uniform float audioDrop;
uniform float audioBeatPhase;
uniform float audioBass;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float twistP;
uniform float throatP;
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

    float tw  = (twistP > 0.001) ? twistP : 1.0;
    float thr = (throatP > 0.01) ? throatP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;

    // Tempo known?  A smooth blend, not a step: the moment the tracker locks
    // (or loses) the tempo must not jump the rings.
    float known = smoothstep(0.0, 0.6, audioPhraseLeft);
    float left  = mix(12.0, audioPhraseLeft, known);
    float tension = clamp(1.0 - left / 16.0, 0.0, 1.0) * (0.35 + 0.65 * audioBuildUp);
    float drop = audioDrop;

    float r = length(p);
    float a = atan(p.y, p.x);

    // Tube depth: 1/r.  The throat narrows with the tension and blows open
    // on the drop.
    float throat = 0.10 * thr * mix(1.0, 0.45, tension) * (1.0 + 2.5 * drop);
    float depth = throat / max(r, 0.01);

    // Rings one beat apart along the depth.  Their phase is the countdown:
    // as seconds-to-boundary shrink, the rings slide toward the throat.
    // (left in seconds; a ring per beat at ~0.47 s means ~2 rings per second.)
    float ringsPhase = left * 2.1 + audioPhrasePos * 32.0;
    float ringCoord = depth * 1.4 - ringsPhase + sceneAdvance * 0.0;
    float ring = pow(0.5 + 0.5 * cos(ringCoord * 6.2831853), 6.0);
    // Each ring pulses on its beat.
    ring *= 0.6 + 0.6 * (0.5 + 0.5 * cos(audioBeatPhase * 6.2831853));

    // Spiral arms twisting into the throat, turning with the music.
    float arms = 0.5 + 0.5 * cos(a * 5.0 + depth * tw * 1.6 - sceneAdvance * 0.8 - drop * 4.0);
    arms = pow(arms, 3.0);

    // Colour: cool at the rim, heating toward the throat and with the tension.
    vec3 cool = imgPalette(hue * 0.159 + 0.35);
    vec3 hot  = imgPalette(hue * 0.159 + 0.9) * 1.5;
    float heat = clamp(1.0 - r * 1.2, 0.0, 1.0) * 0.5 + tension * 0.6;
    vec3 base = mix(cool, hot, heat);

    vec3 col = base * (0.10 + 0.9 * ring + 0.45 * arms) * (0.75 + 0.6 * audioLevel);
    // Photo texture rolled onto the tube, faint.
    vec2 tuv = vec2(a * 0.15915494 + sceneAdvance * 0.02, fract(depth * 0.15));
    col += img(fract(tuv)) * 0.18 * (1.0 - tension * 0.5);

    // Throat glow with the bass; on the drop the throat floods the picture.
    float glow = exp(-r / (0.12 + 0.3 * drop)) * (0.5 + 1.4 * audioBass + 2.0 * drop);
    col += hot * glow;

    // Depth fog: far rings fade (fog rises with distance, correct sign).
    float fog = 1.0 - exp(-depth * 0.06);
    col = mix(col, cool * 0.05, clamp(fog, 0.0, 0.85));
    col *= 0.85 + 0.35 * audioSwell;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
