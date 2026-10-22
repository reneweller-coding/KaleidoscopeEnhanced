//@doc
 * @brief HILL VORTEX SPHERE: a space full of spherical vortices of light points -- Hill's spherical vortex: inside a
 * sphere the fluid circulates in a ring, up through the middle and down round the outside -- each made of points
 * running along its streamlines, the vortices of different sizes drifting through each other along their axes.  A
 * point sits on one of the vortex's nested ring-shaped streamlines (a meridian loop, turned round the axis by its own
 * angle) and runs round it; the loops are drawn by the points' places alone.  The points' light is shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell     -> the circulation's speed
 *   audioAdvance   -> the vortices drift and the points run (integrated)
 *   audioPhrasePos -> each phrase one vortex fades out and a new one fades in elsewhere
 *
 * Knobs: vortexP (how many vortices), pointP (how many points per vortex), hueP.
//@params vortexP pointP
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
    return vec4(prev + (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0)) / 60.0, 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    float swellClock = texelFetch(texState, ivec2(0, 0), 0).r;   // seconds, run faster as the music swells
    vec2 p = screenP();
    float fh = famHue();
    float V = floor(3.0 + 2.0 * clamp(vortexP, 0.0, 1.0));
    float M = floor(70.0 + 50.0 * clamp(pointP, 0.0, 1.0));
    float run = 0.5 * swellClock + 1.0 * audioAdvance;
    float drift = 0.03 * sceneTime + 0.12 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int v = 0; v < 5; ++v) {
        float fv = float(v);
        if (fv >= V) break;
        float R = 0.38 + 0.15 * fract(fv * 0.618);
        vec3 ax = normalize(vec3(sin(1.7 * fv + 0.2), cos(2.3 * fv), 0.5 * sin(fv)));
        vec3 u1 = normalize(cross(ax, vec3(0.3, 0.2, 1.0))), u2 = cross(ax, u1);
        vec3 c = vec3(0.7 * sin(1.9 * fv + 0.2 * drift), 0.35 * cos(1.3 * fv + 0.15 * drift), 2.0 + 0.4 * sin(fv))
                 + ax * 0.5 * sin(drift + fv);
        float life = 0.5 + 0.5 * cos(6.2831853 * (audioPhrasePos + fv / V));
        float on = smoothstep(0.0, 0.35, life);
        for (int i = 0; i < 120; ++i) {
            float fi = float(i);
            if (fi >= M) break;
            float h1 = fract(sin(fi * 12.9898 + fv * 7.0) * 43758.5453), h2 = fract(sin(fi * 78.233 + fv * 3.0) * 43758.5453);
            // the meridian loop: a ring of radius rl round the vortex ring's core at 0.7 R from the axis
            float rl = R * (0.1 + 0.25 * h1);
            float a = run * (0.4 / (0.05 + rl)) + 6.2831853 * h2;
            float az = 6.2831853 * fract(h1 * 7.3 + h2);
            float rho = 0.7 * R + rl * cos(a);
            float along = rl * sin(a) * 1.4;
            vec3 x = c + ax * along + rho * (cos(az) * u1 + sin(az) * u2);
            if (x.z < 0.3) continue;
            vec2 sp = x.xy / x.z * 1.3;
            float size = 0.004 + 0.01 / x.z;
            float d = length(p - sp);
            float g = smoothstep(size, size * 0.6, d) + 0.2 * exp(-d / (size * 2.5));
            col += famLight(fh, fract(0.2 * fv + 0.5 * h1), 0.4) * g * on * (1.4 / x.z);
        }
    }
    finish(famExpose(col, 6.71, 0.90, 0.00, fh));
}
