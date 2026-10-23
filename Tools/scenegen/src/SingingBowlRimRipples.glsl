//@doc
 * @brief SINGING BOWL RIM RIPPLES: a singing bowl whose rim sounds: standing waves with four, six or eight nodes run round the rim, and in the filling ripples and drop jumps arise; the photo appears in the water inside.  The node count glides by cross-fading two neighbouring modes, and the water surface
 * bends the photo like a lens.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mode glides between four, six and eight nodes (integrated)
 *   audioSwell       -> the height of the ripples
 *
 * Knobs: sizeP (the size of the bowl), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
/**  The gradient of one mode of the bowl's water surface (cos of n angles, radial power law).
 *
 * @param p  The point. (in)
 * @param n  The number of angular nodes. (in)
 * @param t  The time. (in)
 * @param R  The bowl's radius. (in)
 *
 * @return
 *   The gradient.
 **/
vec2 modeGrad(vec2 p, float n, float t, float R)
{
    float r = length(p) + 1e-4;
    float th = atan(p.y, p.x);
    float x = r / R;
    float f = pow(x, n * 0.5);
    float df = 0.5 * n * pow(x, n * 0.5 - 1.0) / R;
    float c = cos(n * th - t);
    float s = sin(n * th - t);
    vec2 rh = p / r;
    vec2 th_h = vec2(-rh.y, rh.x);
    return df * c * rh + f * (-n * s) / r * th_h;
}
void main()
{
    vec2 p = screenP();
    float R = 0.43 + 0.08 * clamp(sizeP, 0.0, 1.0);
    float ph = 0.05 * audioHarmAdvance + 0.015 * sceneTime;
    float e = 0.5 - 0.5 * cos(6.2831853 * fract(ph) * 0.5);
    float n0 = 4.0 + 2.0 * mod(floor(ph), 3.0);
    float n1 = 4.0 + 2.0 * mod(floor(ph) + 1.0, 3.0);
    float f = smoothstep(0.1, 0.9, fract(ph));
    float t = 2.0 * sceneTime;
    float amp = 0.02 + 0.05 * clamp(audioSwell, 0.0, 1.0);
    vec2 g = mix(modeGrad(p, n0, t, R), modeGrad(p, n1, t * 1.2, R), f);
    float r = length(p);
    float cap = sin(70.0 * r - 3.0 * sceneTime) * exp(-3.0 * abs(r - R * 0.8)) * 0.004;
    vec2 uv = p * 0.85 + 0.5 + amp * g + cap * p / max(r, 1e-3) * 4.0;
    vec3 water = imgLod(uv, 0.5);
    float spec = pow(max(0.0, dot(normalize(vec3(-amp * g * 6.0, 1.0)), normalize(vec3(0.4, 0.5, 0.8)))), 18.0);
    water = water * 1.05 + spec * 0.3;
    float inside = 1.0 - smoothstep(R * 0.97, R, r);
    float rim = smoothstep(R * 0.97, R, r) * (1.0 - smoothstep(R * 1.05, R * 1.1, r));
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.18;
    vec3 metal = vec3(0.75, 0.6, 0.35) * (0.5 + 0.5 * sin(8.0 * atan(p.y, p.x) + 2.0 * sceneTime * 0.1));
    vec3 col = bg + water * inside + metal * rim * 0.8;
    finish(col);
}
