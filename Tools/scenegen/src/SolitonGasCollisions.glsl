//@doc
 * @brief SOLITON GAS COLLISIONS: a gas of line solitons on shallow water (the Kadomtsev-Petviashvili picture) --
 * long, steep ridges that run in many directions, pass through each other unharmed, and where they cross, rise into
 * a taller stem and are shifted a little: the web of crossing waves seen on flat beaches.  The water refracts the
 * photo below it; the crests shine.  Every soliton lives a while, fades and is reborn running another way.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the solitons' height (and so their speed: higher ones run faster)
 *   audioPhase      -> the palette turns (integrated)
 *   audioKick       -> the crossings flash (light)
 *
 * Knobs: countP (how many solitons), widthP (their width), depthP (how strongly the water refracts), hueP.
//@params countP widthP depthP
//@audio audioSwell audioKick
//@body
/**  The water's height: a sum of sech^2 ridges, each with its own direction, height and speed, the crossings
 * raised (a cheap stand-in for the KP interaction: the product of two ridges adds to their sum).
 *
 * @param x  The point. (in)
 *
 * @return
 *   The height.
 **/
float water(vec2 x)
{
    int n = 4 + int(6.0 * clamp(countP, 0.0, 1.0));
    float w = 0.02 + 0.03 * clamp(widthP, 0.0, 1.0);
    float sum = 0.0, prod = 0.0, prev = 0.0;
    for (int i = 0; i < 10; ++i) {
        if (i >= n) break;
        float fi = float(i);
        // every soliton lives for a while, then fades and is reborn in a new direction
        float life = 24.0 + 10.0 * hash11(fi * 1.7);
        float t = sceneTime + life * hash11(fi * 3.1);
        float gen = floor(t / life), age = fract(t / life);
        float a = 6.2831853 * hash11(fi * 5.3 + gen * 1.1);
        vec2 dir = vec2(cos(a), sin(a));
        float A = (0.5 + 0.5 * hash11(fi * 7.7 + gen)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
        float speed = 0.04 + 0.08 * A;
        float off = (hash11(fi * 9.1 + gen) - 0.5) * 2.0;
        float s = (dot(x, dir) - off - speed * age * life + 1.0) / w;
        float r = A / pow(cosh(clamp(s, -20.0, 20.0)), 2.0) * sin(3.14159265 * age);
        sum += r;
        prod += r * prev;
        prev = max(prev, r);
    }
    return sum + 1.5 * prod;
}

void main()
{
    vec2 p = screenP();
    float h = water(p);
    float e = 0.003;
    vec2 g = vec2(water(p + vec2(e, 0.0)) - h, water(p + vec2(0.0, e)) - h) / e;
    vec2 uv = p * 0.75 + 0.5 + g * (0.002 + 0.006 * clamp(depthP, 0.0, 1.0));
    vec3 photo = imgLod(uv, 0.4);
    vec3 tone = imgPalette(0.4 + 0.2 * h + 0.03 * audioPhase);
    vec3 n = normalize(vec3(-g * 0.02, 1.0));
    float spec = pow(max(dot(reflect(-normalize(vec3(0.3, 0.5, 1.0)), n), vec3(0.0, 0.0, 1.0)), 0.0), 30.0);
    // the crests glow, the crossings blaze
    vec3 col = photo * (0.7 + 0.3 * h) + mix(tone, vec3(1.0), 0.5) * smoothstep(0.15, 0.9, h) * 0.45
               + mix(tone, vec3(1.0), 0.6) * (spec * 0.5 + smoothstep(1.2, 2.0, h) * 0.4 * (0.5 + clamp(audioKick, 0.0, 1.0)));
    finish(col);
}
