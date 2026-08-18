#version 330 core
out vec4 fragColor;
// SpectroCanyon.frag — rock lit from a low sun, with the loud parts of the
// spectrum glowing from inside the stone.  The emission is keyed to the SAME
// value that built the terrain, so a peak is both a peak and a light.

in vec3  vWorld;
in vec3  vNormal;
in float vEnergy;
in float vFreq;
in float vDist;

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float camHP;
uniform float glowP;
uniform float heightP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vec3(0.0, camHP, 0.0) - vWorld);
    vec3 L = normalize(vec3(-0.55, 0.28, -0.78));

    float diff = max(dot(n, L), 0.0);
    float wrap = 0.5 + 0.5 * dot(n, L);

    // Rock: dark and cool, banded by height so the strata read.
    float strata = 0.5 + 0.5 * sin(vWorld.y * 0.55 + 1.7);
    vec3 rock = mix(vec3(0.055, 0.060, 0.085), vec3(0.15, 0.13, 0.14), strata);

    vec3 col = rock * (0.22 + 0.85 * diff + 0.45 * wrap * wrap);

    // Sky bounce from above, so the flat floor is not as dark as the walls.
    col += rock * vec3(0.35, 0.45, 0.75) * max(n.y, 0.0) * (0.45 + 0.5 * audioAmbient);

    // Emission: hue follows the band, brightness follows its energy.  Low bands
    // glow deep red, the top of the spectrum near-white — the canyon is a
    // spectrum analyser you can fly through.
    float hue = fract(0.02 + 0.42 * vFreq + 0.06 * sin(audioChromaHue));
    vec3 fire = mix(hue2rgb(hue), vec3(1.0), 0.25 * vFreq);
    float e = clamp(vEnergy * 1.25 - 0.12, 0.0, 1.0);
    col += fire * pow(e, 2.0) * (0.9 + 2.4 * glowP) * (0.7 + 0.8 * audioLevel);

    // The crests catch a rim of the same colour, which is what keeps the far
    // ridges legible once the haze takes their body.
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    col += fire * fres * e * (0.5 + 1.2 * audioKick);

    // Specular glint off wet stone, sharpened by the treble.
    vec3 H = normalize(L + V);
    col += vec3(0.85, 0.90, 1.0) * pow(max(dot(n, H), 0.0), 45.0)
         * (0.4 + 2.0 * audioHigh);

    // Haze toward the far end of the history, tinted by the slideshow photo so
    // the canyon sits under a sky rather than in a void.
    vec2 skyUV = vec2(vWorld.x / 300.0 + 0.5 + time * 0.003, 0.72);
    vec3 sky = textureLod(tex0, fract(skyUV), 0.0).rgb;
    sky = mix(vec3(dot(sky, vec3(0.333))), sky, 0.55) * 0.45 + vec3(0.03, 0.04, 0.07);
    float haze = clamp(vDist / 200.0, 0.0, 1.0);
    col = mix(col, sky, pow(haze, 1.4));

    col *= 1.0 + 0.18 * audioBeat + 0.20 * audioSubBass;
    col = col / (1.0 + col * 0.28);
    col *= (0.85 + 0.30 * audioLevel + 0.35 * audioKick);
    fragColor = vec4(col, interpolation);
}
