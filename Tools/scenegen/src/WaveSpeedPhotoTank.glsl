//@doc
 * @brief WAVE SPEED PHOTO TANK: a wave tank in which the speed of the waves depends on the brightness of the photo (bright is deep and fast, dark is shallow and slow): the waves run, bend toward the slow places, focus behind bright
 * lenses and break at dark reefs, and the photo itself lies in the tank as the picture seen through the water, refracted by the slope of every wave, its crests catching a soft light.  Two sources wander through the tank; they swell
 * softly on every beat (the beat's phase, never a jump) and their frequency follows the key.  The field runs on with the music (a small wave field of the scene's own).
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase  -> the sources swell softly on every beat
 *   audioHarmAdvance -> the frequency of the sources follows the key
 *   audioSwell      -> the depth of the refraction
 *
 * Knobs: depthP (how much the photo slows the waves), hueP.
//@params depthP
//@audio audioSwell audioHarmAdvance
//@state 320 180 240 32
//@body
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / stateRes) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  One leapfrog step of the wave equation with the speed set by the photo (the state pass).
 *
 * @return
 *   u, the last u, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    vec4 c = stAt(ip);
    float lap = stAt(ip + ivec2(1, 0)).r + stAt(ip - ivec2(1, 0)).r + stAt(ip + ivec2(0, 1)).r + stAt(ip - ivec2(0, 1)).r - 4.0 * c.r;
    float l = luma(imgLod(photoUV(vec2(ip) + 0.5), 2.0));
    float c2 = 0.45 * (0.12 + 0.88 * pow(l, 0.5 + 1.5 * clamp(depthP, 0.0, 1.0)));
    float un = 2.0 * c.r - c.g + c2 * lap;
    vec2 q = (vec2(ip) + 0.5) / stateRes;
    float edge = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
    float damp = 1.0 - 0.07 * smoothstep(0.1, 0.0, edge);
    un = c.r + damp * (un - c.r) - 0.0004 * c.r;
    float bp = rhyBeat();
    float env = smoothstep(0.0, 0.15, bp) * exp(-5.0 * bp);
    float fq = 0.03 + 0.02 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    for (int k = 0; k < 2; ++k) {
        float fk = float(k);
        vec2 sp = stateRes * (0.5 + 0.3 * vec2(sin(0.00006 * stateFrame + 2.1 * fk), cos(0.00005 * stateFrame * 1.3 + 1.7 * fk)));
        float d2 = dot(vec2(ip) + 0.5 - sp, vec2(ip) + 0.5 - sp);
        un += 0.12 * env * exp(-d2 / 6.0) * sin(6.2831853 * fq * stateFrame + fk);
    }
    return vec4(clamp(un, -2.0, 2.0), c.r, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * stateRes;
    float u = stLin(cc).r;
    vec2 g = vec2(stLin(cc + vec2(1.5, 0.0)).r - stLin(cc - vec2(1.5, 0.0)).r, stLin(cc + vec2(0.0, 1.5)).r - stLin(cc - vec2(0.0, 1.5)).r);
    float k = 0.025 + 0.06 * clamp(audioSwell, 0.0, 1.0);
    vec3 c = imgLod(p * 0.8 + 0.5 + g * k * 4.0, 0.7);
    vec3 n = normalize(vec3(-g * 5.0, 1.0));
    float lam = clamp(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
    float spec = pow(clamp(dot(n, normalize(vec3(-0.4, 0.5, 1.8))), 0.0, 1.0), 40.0);
    finish(c * (0.45 + 0.75 * lam) + 0.4 * spec * mix(c, vec3(1.0), 0.5));
}
