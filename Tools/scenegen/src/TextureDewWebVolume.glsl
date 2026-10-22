//@doc
 * @brief TEXTURE DEW WEB VOLUME: a flight through spider webs hung one behind another in the dark, every thread beaded
 * with dew, and every drop holding a tiny upside-down picture of the photo; the webs sway with the bass.  A web is a
 * plane across the flight with radial spokes and a spiral thread; the drops sit along the spiral at even steps, round
 * lenses that show the photo turned over, bright at their rims; the webs are laid from the back to the front, the
 * nearest passing by as the flight goes through.  The sway is the bass, smoothed in a small field of the scene's own.
 * Shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the webs sway (smoothed)
 *   audioAdvance -> the flight through the webs (integrated)
 *   audioSwell   -> the drops' sparkle
 *
 * Knobs: dropP (the drops' size), spokeP (how many spokes), hueP.
//@params dropP spokeP
//@audio audioBass audioSwell
//@state 1 1 60
//@body
/**  The state pass: the bass smoothed.
 *
 * @return
 *   x the smoothed bass, 0, 0, 1.
 **/
vec4 stateStep()
{
    float b = clamp(audioBass, 0.0, 1.0);
    float old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, b, 0.05), 0.0, 0.0, 1.0);
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1, D = 1.7, S = 0.09;                           // focal length, webs' spacing, spiral's step
    float fly = 0.22 * sceneTime + 0.8 * audioAdvance;
    float bass = texelFetch(texState, ivec2(0, 0), 0).r;
    float ns = floor(14.0 + 10.0 * clamp(spokeP, 0.0, 1.0));
    float rd0 = 0.012 + 0.012 * clamp(dropP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.4) * 0.025;
    float k0 = floor(fly / D) + 1.0;
    for (int i = 7; i >= 0; --i) {
        float k = k0 + float(i);
        float dz = k * D - fly;
        if (dz < 0.12) continue;
        vec2 sway = (0.04 + 0.12 * bass) * vec2(sin(0.9 * sceneTime + k), 0.5 * cos(0.7 * sceneTime + 2.0 * k));
        vec2 w = p * dz / F - sway - 0.3 * (hash22(vec2(k, 1.0)) - 0.5);
        float px = dz / F / resolution.y;
        float r = length(w), a = atan(w.y, w.x);
        float fade = exp(-0.12 * dz) * smoothstep(0.12, 0.5, dz) * (1.0 - smoothstep(1.2, 1.6, r));
        // the spokes and the spiral thread
        float sec = 6.2831853 / ns;
        float dsp = abs(mod(a + 0.5 * sec, sec) - 0.5 * sec) * r;
        float sp = r / S - a / 6.2831853;
        float dsr = (0.5 - abs(fract(sp) - 0.5)) * S;
        float thread = exp(-pow(dsp / (1.2 * px + 0.0015), 2.0)) + exp(-pow(dsr / (1.2 * px + 0.0015), 2.0));
        col += famLight(fh, 0.6, 0.5) * thread * 0.15 * fade;
        // the drops along the spiral: the nearest turn, then the nearest step along it
        float turn = floor(sp + 0.5);
        float steps = max(floor(6.2831853 * r / 0.06), 6.0);
        float aq = (floor(a / 6.2831853 * steps + 0.5)) / steps * 6.2831853;
        float rq = (turn + aq / 6.2831853) * S;
        vec2 dc = rq * vec2(cos(aq), sin(aq));
        vec2 dd = w - dc;
        float rr = length(dd) / rd0;
        if (rr < 1.0) {
            vec3 img = tone(imgLod(vec2(0.5) - dd / rd0 * vec2(0.3, 0.45), 1.0), fh);   // turned over in the lens
            vec3 drop = img * (0.5 + 0.6 * glow) + famLight(fh, 0.5, 0.9) * exp(-pow((rr - 0.8) / 0.12, 2.0)) * 0.7 * glow;
            col = mix(col, drop * fade + col * (1.0 - fade), 1.0 - smoothstep(0.85, 1.0, rr));
        }
    }
    finish(famExpose(col, 1.25, 1.00, 0.00, fh));
}
