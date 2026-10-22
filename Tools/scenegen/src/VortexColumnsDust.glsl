//@doc
 * @brief VORTEX COLUMNS DUST: columns of swirling glowing dust standing in every direction through a dark space,
 * like dust devils frozen at all angles: each column is a line in space with dust circling round it, fast near its
 * core and slowly further out, the grains rising along it as they turn.  Columns lean toward each other and part
 * again as they sway.  The grains are round points, near ones large and soft; their light is shades of one colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the vortices' strength: the dust whirls faster and tighter
 *   audioAdvance -> the swirl and the columns' sway (integrated)
 *   audioPhrasePos -> each phrase a new column rises (its dust fades in) while the oldest fades out
 *
 * Knobs: columnP (how many columns), grainP (how many grains per column), hueP.
//@params columnP grainP
//@audio audioSwell audioPhrasePos
//@state 1 1 60 32
//@body
/**  The state pass: a clock whose speed follows the swell, summed step by step (so its speed changes, never its
 * reading).
 *
 * @return
 *   The clock, 0, 0, 1.
 **/
vec4 stateStep()
{
    float prev = stateFrame < 0.5 ? 0.0 : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(prev + (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0)) / 60.0, 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    float swellClock = texelFetch(texState, ivec2(0, 0), 0).r;   // seconds, run faster as the music swells
    vec2 p = screenP();
    float fh = famHue();
    float cols = floor(4.0 + 3.0 * clamp(columnP, 0.0, 1.0));
    float G = floor(60.0 + 30.0 * clamp(grainP, 0.0, 1.0));
    float swirl = 0.3 * swellClock + 0.5 * audioAdvance;
    float sway = 0.03 * sceneTime + 0.1 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int c = 0; c < 7; ++c) {
        float fc = float(c);
        if (fc >= cols) break;
        vec3 ax = normalize(vec3(sin(1.9 * fc + 0.3 * sin(sway + fc)), cos(1.3 * fc), 0.6 * sin(2.7 * fc + sway)));
        vec3 base = vec3(0.7 * sin(2.3 * fc), 0.35 * cos(1.7 * fc), 1.9 + 0.5 * sin(fc));
        vec3 u1 = normalize(cross(ax, vec3(0.3, 0.1, 1.0))), u2 = cross(ax, u1);
        // the columns take turns: one fades in and another out over each phrase
        float life = 0.5 + 0.5 * cos(6.2831853 * (audioPhrasePos + fc / cols));
        float on = smoothstep(0.0, 0.3, life);
        for (int g = 0; g < 90; ++g) {
            float fg = float(g);
            if (fg >= G) break;
            float h1 = fract(sin(fg * 12.9898 + fc * 7.0) * 43758.5453), h2 = fract(sin(fg * 78.233 + fc * 3.0) * 43758.5453);
            float r = 0.03 + 0.2 * h1;
            float a = swirl * (0.3 / (0.05 + r)) + 6.2831853 * h2;
            float s = fract(h2 + 0.05 * swirl) * 1.6 - 0.8;           // rising along the column
            vec3 x = base + ax * s + r * (cos(a) * u1 + sin(a) * u2);
            if (x.z < 0.3) continue;
            vec2 sp = x.xy / x.z * 1.3;
            float size = 0.004 + 0.011 / x.z;
            float d = length(p - sp);
            float g1 = smoothstep(size, size * 0.6, d) + 0.2 * exp(-d / (size * 2.5));
            float ends = smoothstep(0.8, 0.6, abs(s));
            col += famLight(fh, fract(0.2 * fc + 0.5 * h1), 0.4) * g1 * on * ends * (2.0 / x.z);
        }
    }
    finish(col);
}
