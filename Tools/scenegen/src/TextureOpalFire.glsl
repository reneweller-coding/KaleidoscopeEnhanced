//@doc
 * @brief TEXTURE OPAL FIRE: the play-of-colour of a black opal -- the
 * photograph becomes the dark body of the stone, and within it a harlequin
 * mosaic of patches flashes in pure spectral colours, each patch lighting
 * up in its own colour as the stone slowly turns in the light, then
 * dimming while its neighbours flare; fine striations run through the
 * patches, a milky sheen floats over them.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the stone turns (integrated, jump-free)
 *   audioSpread     -> how many patches flash at once
 *   audioKick       -> the flashes flare (light)
 *   audioHigh       -> fine pinfire sparkle (light)
 *   audioMode       -> the body: blue-black in minor, crystal-milky in major
 *   audioSwell      -> the milky sheen (slow)
 *
 * Knobs: patchP (patch size), fireP (colour intensity), bodyP (photo in the body), hueP.
//@params patchP fireP bodyP
//@audio audioSpread audioKick audioHigh audioMode audioSwell
//@body
vec3 spectral(float x)
{
    x = fract(x);
    return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    vec2 uv = p * 0.7 + 0.5 + vec2(0.002, 0.001) * sceneTime;
    float ps = 5.0 + 9.0 * (1.0 - clamp(patchP, 0.0, 1.0));
    vec2 w = p * ps + 2.5 * vec2(fbm3(p * 1.6), fbm3(p * 1.6 + 5.0));
    // Harlequin patches: Voronoi cells with their own grating direction.
    vec2 gi = floor(w), gf = fract(w);
    float f1 = 9.0, f2 = 9.0; vec2 id = gi;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.1 + 0.8 * hash22(gi + o);
        float d = length(gf - c);
        if (d < f1) { f2 = f1; f1 = d; id = gi + o; } else if (d < f2) f2 = d;
    }
    float edge = 0.55 + 0.45 * smoothstep(0.0, 0.3, f2 - f1);   // soft seams, no leading
    float h = hash21(id);
    float gdir = h * 6.2831853;
    vec2 gv = vec2(cos(gdir), sin(gdir));
    // The turning stone: a tilt direction; a patch flashes when its grating faces it.
    float tT = 0.05 * sceneTime + 0.35 * audioAdvance;
    vec2 tilt = vec2(cos(tT), sin(tT * 0.77)) ;
    float align = dot(gv, normalize(tilt + 1e-4)) * 0.5 + 0.5;
    float width = 0.12 + 0.25 * clamp(audioSpread, 0.0, 1.0);
    float flash = smoothstep(1.0 - width, 1.0, align) + 0.25 * smoothstep(1.0 - width * 2.5, 1.0, align);
    float hueShift = hash21(id + 3.0) + 0.35 * dot(p, tilt) + 0.35 * fbm3(w * 0.8 + tT) + hueP * 0.159;
    vec3 fire = spectral(hueShift + 0.3 * align);
    // Striations across each patch along its grating.
    float stri = 0.88 + 0.12 * sin(dot(w, gv.yx * vec2(1.0, -1.0)) * 45.0 + h * 10.0);
    stri *= 0.5 + 0.7 * smoothstep(0.25, 0.75, fbm3(w * 1.3 + h * 9.0));   // patchy inside
    // The body: dark, with the photo as potch.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 photo = imgLod(uv, 1.0);
    vec3 body = mix(vec3(0.01, 0.015, 0.04), vec3(0.2, 0.22, 0.25), mode);
    body = mix(body, body + photo * (0.08 + 0.12 * mode), clamp(bodyP, 0.0, 1.0));
    float fi = 0.6 + 1.2 * clamp(fireP, 0.0, 1.0);
    vec3 col = body + fire * flash * stri * edge * fi * (0.8 + 0.8 * kick) * (0.5 + 0.8 * luma(imgLod(uv, 3.0)));
    // A faint glow of every patch, even the dim ones.
    col += fire * 0.025 * edge * fi;
    // Milky sheen.
    float sheen = fbm3(p * 1.5 + tilt * 0.5);
    col += vec3(0.6, 0.7, 0.8) * smoothstep(0.5, 0.9, sheen) * (0.03 + 0.12 * swell + 0.1 * mode);
    // Pinfire: tiny round sparks.
    vec2 sg = p * 90.0;
    vec2 si = floor(sg), sf = fract(sg);
    vec2 sc = 0.25 + 0.5 * hash22(si);
    float sp = smoothstep(0.25, 0.0, length(sf - sc)) * step(0.97, hash21(si + 1.0));
    float stw = pow(max(0.0, sin(sceneTime * (1.0 + hash21(si + 2.0)) + hash21(si) * 30.0)), 6.0);
    col += spectral(hash21(si + 5.0)) * sp * stw * (0.2 + 1.2 * hi);
    finish(col);
}
