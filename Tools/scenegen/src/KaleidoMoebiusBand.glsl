//@doc
 * @brief KALEIDO MOEBIUS BAND: a flight along a wide Moebius band, so close that its surface fills the frame: the
 * band twists half a turn over its length, so the folded photo on it comes back mirrored after one round, and the
 * road ahead rolls slowly over as the eye follows it.  The band is a ribbon round the flight line whose cross
 * direction turns by pi per length L; a ray finds it by marching to the ribbon (the point's height above the
 * turned cross line), its coordinates along and across give the photo, folded by mirrors along the band.  The
 * photo's own colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the flight along the band (integrated)
 *   audioHarmAdvance -> the fold's order across the band glides with the chord changes
 *   audioSwell       -> the band's edges glow
 *
 * Knobs: widthP (the band's width), heightP (how high the eye flies above it), hueP.
//@params widthP heightP
//@audio audioHarmAdvance audioSwell
//@body
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
    vec2 p = screenP();
    float fh = famHue();
    const float L = 24.0;                                        // the length of a half twist
    float W = 5.0 + 3.0 * clamp(widthP, 0.0, 1.0);
    float hgt = 0.25 + 0.25 * clamp(heightP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float order = 2.0 + 2.0 * (0.5 + 0.5 * sin(0.6 * h));
    float s0 = 0.5 * sceneTime + 2.2 * audioAdvance;            // the eye's place along the band
    // the eye rides above the band's middle, its frame turning with the band (so the road stays below it)
    float th0 = 3.14159265 * s0 / L;
    vec3 ro = vec3(-sin(th0) * hgt, cos(th0) * hgt, s0);
    vec3 fw = vec3(0.0, 0.0, 1.0);
    vec3 up = vec3(-sin(th0), cos(th0), 0.0);
    vec3 rt = cross(fw, up);
    vec3 rd = normalize(fw * 1.0 + rt * p.x + up * (p.y - 0.3));
    float t = 0.0;
    vec3 x = ro;
    float hit = 0.0;
    for (int i = 0; i < 80; ++i) {
        x = ro + rd * t;
        float th = 3.14159265 * x.z / L;
        vec2 c = vec2(cos(th), sin(th));                         // the band's cross direction at this depth
        float across = dot(x.xy, c);
        float height = dot(x.xy, vec2(-c.y, c.x));
        float d = abs(height) * 0.8;
        if (abs(across) > W) d = max(d, abs(across) - W);
        if (d < 0.002) { hit = 1.0; break; }
        t += max(d * 0.7, 0.01);
        if (t > 60.0) break;
    }
    // beyond the band: a dim kaleidoscope of the photo, so the sky is never black
    float sa = abs(mod(atan(rd.y, rd.x) + 0.02 * sceneTime, 1.0471976) - 0.5235988);
    vec3 col = tone(imgLod(vec2(sa, 0.3 + 0.4 * rd.z) + 0.2, 2.0), fh) * 0.3;
    if (hit > 0.5) {
        float th = 3.14159265 * x.z / L;
        float across = dot(x.xy, vec2(cos(th), sin(th))) / W;   // -1..1 (it flips sign after a full round)
        // the fold across (mirrors at the given order) and along the band
        float a = abs(fract(across * order * 0.5 + 0.5) * 2.0 - 1.0);
        float b = abs(fract(x.z / 6.0) * 2.0 - 1.0);
        vec3 photo = imgLod(vec2(a, b) * 0.8 + 0.1, 0.6);
        col = tone(photo, fh) * exp(-0.03 * t);
        col += famLight(fh, 0.6, 0.6) * exp(-(1.0 - abs(across)) / 0.03) * (0.2 + 0.5 * clamp(audioSwell, 0.0, 1.0));
        col = mix(col, famCol(fh, 0.45) * 0.04, smoothstep(25.0, 55.0, t));
    }
    finish(col);
}
