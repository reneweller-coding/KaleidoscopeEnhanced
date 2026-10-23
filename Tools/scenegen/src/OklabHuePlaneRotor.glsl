//@doc
 * @brief OKLAB HUE PLANE ROTOR: the Oklab colour space: a plane of constant lightness on which hue and saturation lie as a disc; the photo is projected into this plane and circles round the middle, with lightness as the third axis.  Every pixel's colour is turned into Oklab, its hue is rotated by an angle that runs on, its
 * lightness is pulled towards a plane by a share that swells and fades, and a disc of the hue plane itself stands in the middle.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the lightness plane: how far the photo is flattened into it
 *   audioAdvance -> the hue turns (integrated)
 *
 * Knobs: sizeP (the size of the disc), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  A colour in the Oklab space.
 *
 * @param c  The linear RGB colour. (in)
 *
 * @return
 *   L, a, b.
 **/
vec3 toOklab(vec3 c)
{
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
    l = pow(max(l, 0.0), 1.0 / 3.0); m = pow(max(m, 0.0), 1.0 / 3.0); s = pow(max(s, 0.0), 1.0 / 3.0);
    return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
/**  A colour from the Oklab space back to RGB.
 *
 * @param c  The Oklab colour. (in)
 *
 * @return
 *   The colour.
 **/
vec3 fromOklab(vec3 c)
{
    float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
    float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
    float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
    l = l * l * l; m = m * m * m; s = s * s * s;
    return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
void main()
{
    vec2 p = screenP();
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    vec3 lab = toOklab(c);
    float th = 0.03 * audioAdvance + 0.05 * sceneTime;
    vec2 ab = rot2(th) * lab.yz * 1.35;
    float plane = 0.55 + 0.25 * sin(0.04 * sceneTime);
    float w = 0.2 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float L = mix(lab.x, plane, w);
    vec3 col = clamp(fromOklab(vec3(L, ab)), 0.0, 1.0);
    float Rd = 0.15 + 0.1 * clamp(sizeP, 0.0, 1.0);
    float r = length(p);
    if (r < Rd) {
        vec2 q = rot2(th) * p / Rd * 0.32;
        vec3 pl = clamp(fromOklab(vec3(plane, q)), 0.0, 1.0);
        float edge = smoothstep(Rd, Rd * 0.96, r);
        col = mix(col, pl, edge);
    }
    float ring = exp(-pow((r - Rd) / 0.004, 2.0));
    finish(col * 1.05 + vec3(ring) * 0.5);
}
