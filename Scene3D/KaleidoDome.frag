#version 330 core
out vec4 fragColor;
// KaleidoDome.frag — a 10-sector kaleidoscope rosette of the current image
// spinning across the dome; kicks bloom the centre, the bar phase breathes
// the fold radius.
uniform sampler2D tex0;
uniform float time;
uniform float sceneSeed;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioDrop;
uniform float audioSwell;
uniform float audioChromaHue;

in vec2  vUV;
in float vR;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec2 mfold(vec2 uv) { return abs(fract(uv * 0.5) * 2.0 - 1.0); }

void main()
{
    // Rosette: fold the dome angle into 8/10/12/14 mirrored sectors (rolled
    // per activation), spin with the music; the radius breathes with the swell.
    float ang = atan(vUV.y, vUV.x) + time * 0.06 + audioAdvance * 0.30;
    float sector = 6.2831853 / (8.0 + 2.0 * floor(sceneSeed * 3.999));
    ang = abs(mod(ang, sector * 2.0) - sector);

    float r = vR * (1.15 + 0.20 * audioSwell) + 0.06 * time
            + 0.20 * audioAdvance;

    // Map the folded angle ACROSS the sector to one texture axis and the
    // radius to the other — every wedge shows a real 2D crop of the image.
    // (The old dir(ang)*r sampling collapsed each wedge onto a thin ray
    // through the texture: the image smeared into long radial streaks.)
    vec2 crop = vec2(sceneSeed * 3.7, sceneSeed * 7.3);
    vec2 uv = vec2(ang / sector * 1.6 + crop.x,
                   r * 0.9 + crop.y);
    vec3 col = texture(tex0, mfold(uv)).rgb;

    // Centre bloom on the kick, whole-sky flash on a drop.
    float centre = exp(-vR * 2.2);
    col *= 0.80 + 0.9 * centre * audioKick + 1.1 * audioDrop
         + 0.25 * audioSwell;

    // Sector seams glow softly in the key colour.
    float seam = exp(-abs(ang - sector * 0.5) * 24.0);
    col += hueRot(vec3(0.35, 0.5, 0.7), audioChromaHue) * seam * 0.30;

    fragColor = vec4(col * 1.30, 1.0);
}
