//@doc
 * @brief CAMSHAFT STRIP WAVE: a camshaft with a hundred cams that pushes a band of photo strips up and down: every strip rides on its own cam, set at its own angle on the shaft, so the band runs in a wave; the shape of the cams changes
 * -- round and eccentric, two-lobed, or the sharp drop of a tear-shaped cam -- and the wave takes on the cams' character.  The shaft turns once through a bar; the cams follow the key (the shapes crossing over), the lift the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the shaft turns once a bar
 *   audioHarmAdvance -> the cam shape changes (crossing over)
 *   audioSwell      -> the lift
 *
 * Knobs: stripP (the number of strips), hueP.
//@params stripP
//@audio audioSwell audioHarmAdvance
//@body
/**  The lift of a cam of a given shape at an angle of the shaft.
 *
 * @param x    The angle in radians. (in)
 * @param sh   The shape, 0 round and eccentric, 1 two-lobed, 2 tear-shaped. (in)
 *
 * @return
 *   The lift, -1..1.
 **/
float camLift(float x, float sh)
{
    float a = cos(x);
    float b = cos(2.0 * x);
    float c = pow(0.5 + 0.5 * cos(x), 2.5) * 2.0 - 0.7;
    return sh < 1.0 ? mix(a, b, sh) : mix(b, c, sh - 1.0);
}
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 40.0 + 80.0 * clamp(stripP, 0.0, 1.0);
    float xs = (p.x / asp + 0.5) * N;
    float k = floor(xs);
    float f = fract(xs);
    float shp = 2.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float ang = 6.2831853 * rhyBar() + k * 0.3 / (1.0 + 0.0 * N);
    float lift = (0.04 + 0.14 * clamp(audioSwell, 0.0, 1.0)) * camLift(ang, shp);
    vec3 c = imgLod(vec2(p.x * 0.8 + 0.5, (p.y - lift) * 0.8 + 0.5), 0.8);
    float joint = smoothstep(0.0, 0.12, f) * smoothstep(1.0, 0.88, f);
    finish(c * (0.7 + 0.3 * joint) * 1.1);
}
