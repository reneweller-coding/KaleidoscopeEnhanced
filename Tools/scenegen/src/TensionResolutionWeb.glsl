//@doc
 * @brief TENSION RESOLUTION WEB: a web of glowing strings spanning the picture tightens with the harmonic tension --
 * the strings drawn straight and humming -- and slackens when the music resolves at the end of a phrase, the strings
 * sagging softly and falling still.  The tension is the roughness and the chord changes, let go toward each phrase's
 * end and smoothed over a second or so in a small field of the scene's own; the web is radial threads and rings of
 * threads between them, each sagging by the slack and trembling by the tension.  The light is shades of one colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness, audioHarmChange -> the tension: the strings tighten and hum (smoothed)
 *   audioPhrasePos                  -> the resolution: toward each phrase's end the web slackens
 *   audioAdvance                    -> the strings' trembling runs (integrated)
 *   audioSwell                      -> the strings' glow
 *
 * Knobs: threadP (how many radial threads), sagP (how far the slack strings sag), hueP.
//@params threadP sagP
//@audio audioRoughness audioHarmChange audioPhrasePos audioSwell
//@state 1 1 60
//@body
/**  The state pass: the tension, smoothed over about a second.
 *
 * @return
 *   The smoothed tension, 0, 0, 1.
 **/
vec4 stateStep()
{
    float t = clamp(0.7 * audioRoughness + 0.6 * audioHarmChange, 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.0, audioPhrasePos));
    float old = stateFrame < 0.5 ? t : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, t, 0.025), 0.0, 0.0, 1.0);
}

/**  A string's light: the distance to a sagging, trembling string between two points.
 *
 * @param p     The place. (in)
 * @param a     The string's start. (in)
 * @param b     Its end. (in)
 * @param sag   How far it sags. (in)
 * @param hum   How far it trembles. (in)
 * @param run   The trembling's phase. (in)
 *
 * @return
 *   The distance.
 **/
float stringD(vec2 p, vec2 a, vec2 b, float sag, float hum, float run)
{
    vec2 ab = b - a;
    float L = length(ab);
    vec2 t = ab / L, n = vec2(-t.y, t.x);
    float s = clamp(dot(p - a, t) / L, 0.0, 1.0);
    float off = -sag * L * sin(3.14159265 * s) * sign(n.y + 1e-4) + hum * sin(3.14159265 * s) * sin(30.0 * s + run);
    return abs(dot(p - a, n) - off);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(10.0 + 6.0 * clamp(threadP, 0.0, 1.0));
    float T = texelFetch(texState, ivec2(0, 0), 0).r;
    float sag = (0.04 + 0.08 * clamp(sagP, 0.0, 1.0)) * (1.0 - T);
    float hum = 0.006 * T;
    float run = 2.0 * sceneTime + 8.0 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float r = length(p), a = atan(p.y, p.x);
    float sec = 6.2831853 / N;
    float k = floor(a / sec);
    float best = 9.0;
    // the two radial threads either side, and the ring threads between them
    for (int i = 0; i < 2; ++i) {
        float ai = (k + float(i)) * sec;
        best = min(best, stringD(p, vec2(0.0), 1.3 * vec2(cos(ai), sin(ai)), sag * 0.3, hum, run + ai * 5.0));
    }
    for (int j = 1; j <= 9; ++j) {
        float rj = 0.1 * float(j) * (1.0 + 0.04 * float(j));
        vec2 a0 = rj * vec2(cos(k * sec), sin(k * sec)), a1 = rj * vec2(cos((k + 1.0) * sec), sin((k + 1.0) * sec));
        best = min(best, stringD(p, a0, a1, sag, hum, run + float(j)));
    }
    float lw = 1.4 / resolution.y + 0.0006;
    vec3 col = famCol(fh, 0.45) * 0.015;
    col += famLight(fh, 0.3 + 0.4 * T, 0.4 + 0.4 * T) * (exp(-pow(best / lw, 2.0)) + 0.2 * exp(-best / (5.0 * lw))) * (0.5 + 0.8 * T) * glow;
    col += famLight(fh, 0.5, 0.8) * exp(-r * r / 0.0008) * 0.6;
    finish(famExpose(col, 3.99, 0.90, 0.03, fh));
}
