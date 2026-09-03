#version 330 core
out vec4 fragColor;
/**
 * @file TempoGearwork.frag
 * @brief TEMPO GEARWORK: a train of gears driven by the bar clock.  The big
 * wheel makes one turn per bar, the next two turns, the next four -- the
 * bar phase is the angle, so the whole train is locked to the music without
 * an integrator and without a jump (a whole number of turns per bar wraps
 * exactly).  Meshing gears counter-rotate; teeth catch the light as they
 * pass; the kick throws sparks at the meshing points.  When the tempo is
 * unknown the train idles on the scene clock, blending over without a
 * step.
 *
 * Audio Reactivity:
 *   audioBarPhase -> gear angles (exact, continuous through the wrap)
 *   audioKick     -> sparks at the meshing points (light)
 *   audioLevel    -> lamp brightness
 *   audioSwell    -> the brass warms (slow)
 *   sceneAdvance  -> idle rotation when the tempo is unknown
 *
 * Per-activation variety: teethP (tooth count of the big wheel), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBarPhase;
uniform float audioPhraseLeft;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float teethP;
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

// Signed distance to a gear: a disc with a cosine tooth profile, and a hub hole.
float gear(vec2 q, float R, float teeth, float ang)
{
    float a = atan(q.y, q.x) - ang;
    float r = length(q);
    float tooth = 0.5 + 0.5 * cos(a * teeth);
    float edge = R * (0.88 + 0.12 * smoothstep(0.3, 0.7, tooth));
    float d = r - edge;
    float hole = 0.22 * R - r;
    return max(d, hole);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float T = floor((teethP > 5.0 ? teethP : 24.0) + 0.5);
    // Tempo known?  Blend between the bar clock and an idle clock.
    float known = smoothstep(0.0, 0.6, audioPhraseLeft);
    float barTurn = audioBarPhase * 6.2831853;
    float idle = sceneAdvance * 0.4 + sceneTime * 0.1;
    // Both are angles; mixing angles across the wrap is safe here because the
    // gear is symmetric under 2 pi / teeth and the idle clock is continuous.
    float base = mix(idle, barTurn, known);

    // Three gears in a train: R, R/2, R/4 with tooth counts T, T/2, T/4;
    // each turns 1, 2, 4 times per bar and alternates direction.
    vec2 c0 = vec2(-0.32, -0.05);
    float R0 = 0.42;
    vec2 c1 = c0 + vec2(R0 + R0 * 0.5, 0.0) * 0.97;
    float R1 = R0 * 0.5;
    vec2 c2 = c1 + vec2(0.0, R1 + R1 * 0.5) * 0.97;
    float R2 = R1 * 0.5;
    float a0 = base;
    float a1 = -base * 2.0 + 3.14159265 / (T * 0.5);      // half-tooth offset so teeth interleave
    float a2 = base * 4.0;

    float d0 = gear(p - c0, R0, T, a0);
    float d1 = gear(p - c1, R1, T * 0.5, a1);
    float d2 = gear(p - c2, R2, T * 0.25, a2);
    float d = min(d0, min(d1, d2));

    // Brass, warming on the swell; teeth catch a lamp from the upper left.
    vec3 brass = mix(imgPalette(hue * 0.159 + 0.1), vec3(0.85, 0.65, 0.3), 0.5) * (0.8 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    vec3 dark  = imgPalette(hue * 0.159 + 0.6) * 0.12;
    float inside = 1.0 - smoothstep(-0.003, 0.003, d);
    float edge = exp(-abs(d) * 120.0);
    // Cheap shading: gradient of the distance field approximates the normal.
    vec2 e = vec2(0.004, 0.0);
    float gx = min(gear(p - c0 + e.xy, R0, T, a0), min(gear(p - c1 + e.xy, R1, T * 0.5, a1), gear(p - c2 + e.xy, R2, T * 0.25, a2))) - d;
    float gy = min(gear(p - c0 + e.yx, R0, T, a0), min(gear(p - c1 + e.yx, R1, T * 0.5, a1), gear(p - c2 + e.yx, R2, T * 0.25, a2))) - d;
    float lit = clamp(0.5 + 1.5 * (-gx + gy) / 0.004 * 0.5, 0.0, 1.0);
    // Spokes on the big wheel, a photo face on the discs.
    vec2 q0 = p - c0;
    float spokes = pow(0.5 + 0.5 * cos((atan(q0.y, q0.x) - a0) * 5.0), 8.0);
    float rim = smoothstep(0.55, 0.75, length(q0) / R0);
    float cut = (length(q0) < R0 * 0.75 && length(q0) > R0 * 0.25) ? (1.0 - spokes) * (1.0 - rim) : 0.0;
    vec3 face = img(fract(p * 0.8 + 0.5)) * brass;
    vec3 gearCol = mix(brass * (0.35 + 0.6 * lit), face * 0.5, 0.3) * (0.6 + 0.5 * audioLevel);
    gearCol *= 1.0 - 0.85 * cut;                                  // spoke cut-outs show the background

    // Background: a dark workshop wall with the photo faint.
    vec3 bg = dark + img(fract(p * 0.35 + 0.5)) * 0.05;
    vec3 col = mix(bg, gearCol, inside);
    col += brass * edge * 0.5;

    // Sparks at the meshing points on the kick.
    vec2 m01 = mix(c0, c1, R0 / (R0 + R1));
    vec2 m12 = mix(c1, c2, R1 / (R1 + R2));
    float sp = exp(-length(p - m01) * 30.0) + exp(-length(p - m12) * 30.0);
    col += vec3(1.0, 0.85, 0.5) * sp * audioKick * 1.5;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
