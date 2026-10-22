//@doc
 * @brief TWISTED FIBER ROPE: inside a rope of thousands of thin glowing fibres that wind round the line of flight;
 * the eye travels down its hollow core and the fibres stream past on every side, converging far ahead.  The fibres
 * lie in rings, each ring as many as fit round it, so the cross section is evenly filled; the twist turns the cross
 * section with depth.  The fibres take their shades of one colour family from a ring through the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell    -> the twist tightens (a bounded wave of twist along the rope, so nothing far away spins)
 *   audioAdvance  -> the travel (integrated) and the pulses running down the fibres
 *   audioOnset    -> the pulses' brightness
 *   audioCentroid -> the pulses' temperature
 *
 * Knobs: twistP (the rope's base twist), densityP (how many fibres), hueP.  Distinct from TwinHelixTunnel, which
 * has two helices.
//@params twistP densityP
//@audio audioSwell audioOnset audioCentroid
//@body
/**  The nearest fibre in a ring.
 *
 * @param r    The point's radius. (in)
 * @param th   The point's angle in the rope's turning frame. (in)
 * @param n    The ring's number. (in)
 * @param dr   The rings' spacing. (in)
 * @param id   Returns the fibre's angle (its identity in the ring). (out)
 *
 * @return
 *   The distance to the fibre in the cross section.
 **/
float ringFibre(float r, float th, float n, float dr, out float id)
{
    float rn = n * dr;
    float m = max(floor(6.2831853 * rn / dr), 3.0);
    float off = 0.5 * fract(n * 0.618034);
    float k = floor(th * m / 6.2831853 + off + 0.5) - off;
    id = fract((k + off) / m) + n * 0.1;
    float dth = th - k * 6.2831853 / m;
    return length(vec2(r - rn, rn * dth));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float dr = 0.11 - 0.04 * clamp(densityP, 0.0, 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float base = 0.12 + 0.12 * clamp(twistP, 0.0, 1.0);
    float travel = 0.6 * sceneTime + 2.5 * audioAdvance;
    float pulseRun = 0.8 * audioAdvance + 0.05 * sceneTime;
    float pulseAmp = 0.3 + 1.4 * clamp(audioOnset, 0.0, 1.0);
    float warm = clamp(audioCentroid, 0.0, 1.0);
    vec3 rd = normalize(vec3(p, 0.9));
    rd.xz = rot2(0.12 * sin(0.03 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.1 * sin(0.026 * sceneTime + 1.3)) * rd.yz;
    float lat = max(length(rd.xy), 0.04);
    vec3 col = vec3(0.0);
    float t = 0.0;
    for (int i = 0; i < 110; ++i) {
        vec3 x = rd * t;
        float zw = x.z + travel;
        float r = length(x.xy);
        float ang = base * zw + (0.5 + 0.9 * sw) * sin(0.21 * zw);
        float th = mod(atan(x.y, x.x) - ang, 6.2831853);
        float n0 = floor(r / dr + 0.5);
        float best = 1e9, bid = 0.0;
        for (int j = -1; j <= 1; ++j) {
            float n = n0 + float(j);
            if (n < 3.0) continue;
            float id;
            float d = ringFibre(r, th, n, dr, id);
            if (d < best) { best = d; bid = id; }
        }
        float w = dr * 0.14;
        float g = exp(-pow(best / w, 2.0)) + 0.08 * w * w / (w * w + best * best);
        float pulse = pow(0.5 + 0.5 * cos(6.2831853 * (0.06 * zw - pulseRun + 7.31 * bid)), 18.0);
        vec3 photo = imgLod(vec2(0.5) + 0.38 * vec2(cos(6.2831853 * bid), sin(6.2831853 * bid)), 2.5);
        vec3 c = famLight(fh, 0.15 + 0.7 * luma(photo), (0.2 + 0.5 * warm) * pulse);
        float fade = exp(-0.13 * t);
        float stepLen = clamp(0.5 * best / lat, 0.01, 0.6);
        col += c * g * (0.45 + pulseAmp * pulse) * fade * min(stepLen, 0.15) * 2.2;
        t += stepLen;
        if (t > 16.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
