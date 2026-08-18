#version 330 core
out vec4 fragColor;
// PhotoTunnel.frag — the wall texture is the CURRENT IMAGE, folded into
// kaleidoscope sectors around the tube and scrolling toward the camera.
uniform sampler2D tex0;
uniform float time;
uniform float sceneSeed;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioDrop;
uniform float audioChromaHue;
uniform float audioBarPhase;

in vec2  vUV;
in float vDist;
in float vAng;

/**
 * @file PhotoTunnel.frag
 * @brief Shades the tunnel wall as the current slideshow image (tex0),
 * kaleidoscope-folded into 6/8/10/12 mirrored sectors and scrolled toward
 * the camera.
 *
 * sceneSeed picks the sector count per activation. audioAdvance drives
 * both the slow sector rotation and the image's inward scroll speed;
 * audioKick and audioDrop flash the walls brighter; a luminous ring keyed
 * to audioBarPhase sweeps down the tunnel once per bar, coloured by
 * audioChromaHue.
 */

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec2 mfold(vec2 uv) { return abs(fract(uv * 0.5) * 2.0 - 1.0); }

void main()
{
    // Kaleidoscope fold around the tube: 6/8/10/12 mirrored sectors (rolled
    // per activation), slowly turning.
    float a = vAng + time * 0.10 + audioAdvance * 0.25;
    float sector = 6.2831853 / (6.0 + 2.0 * floor(sceneSeed * 3.999));
    a = abs(mod(a, sector * 2.0) - sector);

    // The music scrolls the image down the tube.
    vec2 uv = vec2(a * 1.6, vUV.y * 7.0 - time * 0.30 - audioAdvance * 1.1);
    vec3 col = texture(tex0, mfold(uv)).rgb;

    // A luminous ring sweeps through once per bar; kicks flash the walls.
    float ring = exp(-abs(fract(vUV.y * 3.0 - audioBarPhase) - 0.5) * 16.0);
    col *= 0.85 + 0.5 * audioKick + 0.9 * audioDrop + 0.55 * ring;
    col += hueRot(vec3(0.5, 0.2, 0.6), audioChromaHue) * ring * 0.35;

    col *= exp(-vDist * 0.020);                        // depth fog
    fragColor = vec4(col * 1.25, 1.0);
}
