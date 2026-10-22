//@doc
 * @brief HYPERSPHERE DOT ROTATION: points on a Clifford torus in four dimensions -- (cos a, sin a, cos b, sin b) / sqrt2
 * on the unit hypersphere -- turned in four dimensions and projected stereographically into space and then onto the
 * screen: the points stream through each other, forming interlinked rings (Hopf circles) that roll through
 * themselves, inside out.  The 4D turn mixes the planes xw and yz by one angle and xy by another; a section blends
 * the stereographic projection with a plain orthographic one, so the rings swell and flatten.  The points are round;
 * their light is shades of one colour family from the photo, by their place on the torus.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the four-dimensional turn (integrated)
 *   audioSectionId/Age -> every new section switches between stereographic and flat projection (over six seconds)
 *   audioSwell         -> the points' glow
 *
 * Knobs: gridP (how many points round each circle), ringP (how much the rings stand out), hueP.
//@params gridP ringP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(12.0 + 6.0 * clamp(gridP, 0.0, 1.0));
    float ph = 0.05 * sceneTime + 0.2 * audioAdvance;
    float proj = mix(mod(max(audioSectionPrev, 0.0), 2.0), mod(max(audioSectionId, 0.0), 2.0), smoothstep(0.0, 6.0, audioSectionAge));
    float ring = 0.5 + 0.5 * clamp(ringP, 0.0, 1.0);
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.012;
    float c1 = cos(ph), s1 = sin(ph), c2 = cos(0.7 * ph), s2 = sin(0.7 * ph);
    for (int i = 0; i < 18; ++i) {
        if (float(i) >= n) break;
        for (int j = 0; j < 18; ++j) {
            if (float(j) >= n) break;
            float a = 6.2831853 * float(i) / n, b = 6.2831853 * (float(j) + 0.5 * float(i)) / n;
            vec4 q = vec4(cos(a), sin(a), cos(b), sin(b)) * 0.70710678;
            // the 4D turn: xw and yz by one angle, xy by another
            q = vec4(c1 * q.x - s1 * q.w, c1 * q.y - s1 * q.z, s1 * q.y + c1 * q.z, s1 * q.x + c1 * q.w);
            q.xy = mat2(c2, s2, -s2, c2) * q.xy;
            vec3 stereo = q.xyz / max(1.0 - q.w, 0.15);
            vec3 flat_ = q.xyz * 1.4;
            vec3 x = mix(stereo, flat_, proj) * 0.55;
            x.z += 2.6;
            vec2 sp = x.xy / x.z * 1.4;
            float size = 0.003 + 0.012 / x.z;
            float d = length(p - sp);
            float g = smoothstep(size, size * 0.6, d) + 0.2 * exp(-d / (size * 2.5));
            float stripe = mix(1.0, 0.4 + 0.6 * step(0.5, fract(float(i) * 0.5)), ring);
            col += famLight(fh, float(j) / n, 0.4) * g * glow * stripe * (1.6 / x.z);
        }
    }
    finish(famExpose(col, 2.25, 0.80, 0.00, fh));
}
