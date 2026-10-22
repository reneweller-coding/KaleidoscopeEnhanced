//@doc
 * @brief PHOTO COLOUR SPACE CLOUD: the photo's pixels as a cloud of stars in the Lab colour space: every sampled pixel
 * becomes a star of its own colour, placed by its lightness (up) and its two colour axes (across and deep), so each
 * photo builds its own galaxy of colours -- a dense spindle of greys, arms reaching out toward its strongest hues --
 * that turns slowly round the photo's mean colour and reshapes itself as the photos cross-fade.  The colour goes from
 * sRGB to linear light, to XYZ and to Lab (D65); the cloud turns about the lightness axis and is seen in perspective,
 * near stars larger.  The stars keep the photo's own colours: the cloud is the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the cloud turns (integrated)
 *   audioSwell   -> the stars' glow
 *
 * Knobs: spreadP (how far the cloud spreads), starP (the stars' size).
//@params spreadP starP
//@audio audioSwell
//@body
/**  A colour from sRGB to Lab (D65), scaled: L / 100, a / 100, b / 100.
 *
 * @param c  The sRGB colour. (in)
 *
 * @return
 *   The Lab colour.
 **/
vec3 toLab(vec3 c)
{
    vec3 l = pow(max(c, 0.0), vec3(2.2));
    vec3 xyz = mat3(0.4124, 0.2126, 0.0193, 0.3576, 0.7152, 0.1192, 0.1805, 0.0722, 0.9505) * l;
    xyz /= vec3(0.9505, 1.0, 1.089);
    vec3 f = mix(7.787 * xyz + 16.0 / 116.0, pow(xyz, vec3(1.0 / 3.0)), step(0.008856, xyz));
    return vec3(1.16 * f.y - 0.16, 5.0 * (f.x - f.y), 2.0 * (f.y - f.z));
}

void main()
{
    vec2 p = screenP();
    float spread = 1.6 + 1.0 * clamp(spreadP, 0.0, 1.0);
    vec3 mean = toLab(imgLod(vec2(0.5), 8.0));                       // the cloud is centred on the photo's mean colour
    float sz = 0.008 + 0.008 * clamp(starP, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.12 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(0.012);
    for (int i = 0; i < 336; ++i) {
        float fi = float(i);
        vec2 uv = vec2((mod(fi, 24.0) + 0.5) / 24.0, (floor(fi / 24.0) + 0.5) / 14.0);
        uv += (vec2(fract(sin(fi * 12.9898) * 43758.5453), fract(sin(fi * 78.233) * 43758.5453)) - 0.5) / vec2(24.0, 14.0);
        vec3 c = imgLod(uv, 1.5);
        vec3 lab = toLab(c);
        vec3 x = vec3((lab.y - mean.y) * spread, (lab.x - mean.x) * 1.4, (lab.z - mean.z) * spread);
        x.xz = rot2(turn) * x.xz;
        x.yz = rot2(0.35) * x.yz;
        float z = x.z + 2.8;
        vec2 sp = x.xy / z * 2.0;
        vec2 d = p - sp;
        float dd = dot(d, d);
        float s = sz * 2.4 / z;
        if (dd > 36.0 * s * s) continue;
        col += c * (smoothstep(s, s * 0.5, sqrt(dd)) + 0.3 * exp(-sqrt(dd) / (2.0 * s))) * glow;
    }
    finish(col);
}
