#version 330 core
out vec4 fragColor;
/**
 * @file LenticularFlip.frag
 * @brief LENTICULAR FLIP: a lenticular print of the two photos.  Under the
 * ribbed lens sheet the two images are interlaced in strips; the viewing
 * angle -- which decides which strip each lenticule shows -- sweeps slowly
 * on the swell and drifts on the scene clock, so the print flips from one
 * photo to the other in a wave that runs across the sheet, with the
 * refracted smear and rainbow fringe of a real lenticular between the two.
 * The camera never moves; only the angle of view changes, smoothly.
 *
 * Audio Reactivity:
 *   audioSwell   -> viewing angle (slow)
 *   sceneAdvance -> angle drift and the wave across the sheet (continuous)
 *   audioKick    -> the ribs catch a highlight (light)
 *   audioHigh    -> rainbow fringe (light/colour)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: pitchP (lenticule pitch), waveP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float pitchP;
uniform float waveP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);
    vec2 uv = gl_FragCoord.xy / resolution;

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float pitch = 40.0 + 60.0 * clamp(pitchP, 0.0, 1.0);        // lenticules across
    float wave = 0.5 + 1.5 * clamp(waveP, 0.0, 1.0);
    // Viewing angle: -1..1; the swell tilts it, the scene clock drifts it,
    // and a wave across the sheet gives every column its own angle.
    float view = sin(sceneAdvance * 0.3 + sceneTime * 0.05) * 0.6
               + (clamp(audioSwell, 0.0, 1.0) - 0.5) * 0.8
               + sin(p.x * 3.0 * wave - sceneAdvance * 0.6) * 0.35;
    view = clamp(view, -1.0, 1.0);

    // Under each lenticule the two images are interlaced; the lens maps
    // the viewing angle to a position under it.  Position 0..1 across the
    // lenticule = which strip is seen: <0.5 photo A, >0.5 photo B, with the
    // lens blur between.
    float lx = uv.x * pitch;
    float cell = floor(lx);
    float within = fract(lx) - 0.5;                     // -0.5..0.5 across the rib
    float seen = 0.5 + 0.5 * view + within * 0.9;       // where under the rib we look
    float mixAB = smoothstep(0.35, 0.65, seen);
    // Refraction across the rib: the image under it is magnified (the
    // classic smear); sample with an offset.
    vec2 suv = uv + vec2(within * 0.012, 0.0);
    vec3 A = texture(tex0, clamp(suv, 0.0, 1.0)).rgb;
    vec3 B = texture(tex1, clamp(suv, 0.0, 1.0)).rgb;
    vec3 col = mix(A, B, mixAB);
    // Rainbow fringe at the flip (dispersion), stronger with the treble.
    float fr = exp(-abs(seen - 0.5) * 8.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    vec3 rainbow = 0.5 + 0.5 * cos(6.2831853 * (seen * 2.0 + vec3(0.0, 0.33, 0.66)));
    col += rainbow * fr * (0.08 + 0.35 * hi);
    // The ribs: a highlight where the lens surface faces the light; the
    // kick brightens it.
    float rib = pow(1.0 - abs(within) * 2.0, 6.0);
    col += imgPalette(hue * 0.159 + 0.9) * rib * (0.06 + 0.35 * audioKick);
    // Slight darkening at the rib edges (the lens seam).
    col *= 0.85 + 0.15 * (1.0 - pow(abs(within) * 2.0, 8.0));
    // Sheet vignette.
    col *= 0.7 + 0.3 * (1.0 - length(p) * 0.6);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
