#version 330 core
out vec4 fragColor;
// SpectrumCity.frag — night city. Almost all of the light in the frame comes
// from the windows, so the window grid is the shader, and the surface material
// is barely more than dark glass to hang it on.

in vec3  vWorld;
in vec3  vNormal;
in float vFaceU;
in float vUp;
in float vLot;
in float vEnergy;
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

float hash1(vec2 p) { return fract(sin(dot(p, vec2(41.317, 289.113))) * 43758.5453); }

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vec3(0.0, camHP, 0.0) - vWorld);

    // Sky: a low, cold gradient with the slideshow photo bleeding into it.
    vec3 skyLo = vec3(0.020, 0.028, 0.055);
    vec3 skyHi = vec3(0.055, 0.075, 0.135);
    vec3 hazeCol = mix(skyLo, skyHi, 0.6) * (1.0 + 0.6 * audioAmbient);

    // Concrete, lit by almost nothing — a night city has no key light.
    vec3 wall = mix(vec3(0.030, 0.033, 0.042), vec3(0.070, 0.068, 0.075), vLot);
    vec3 col = wall * (0.35 + 0.45 * max(n.y, 0.0));

    if (n.y < 0.5)
    {
        // ---- windows ----
        // The grid is in WORLD units, so every tower has the same floor height
        // and the city reads as one place instead of a pile of scaled boxes.
        vec2 cell = vec2(vFaceU / 1.15, vUp / 1.6);
        vec2 idx  = floor(cell);
        vec2 f    = fract(cell);

        // Frame around each pane.
        float pane = step(0.12, f.x) * step(f.x, 0.88)
                   * step(0.16, f.y) * step(f.y, 0.84);

        // Which windows are lit at all: a stable per-window draw, biased by the
        // band energy of the building, so a loud band lights up its tower.
        float r = hash1(idx + vec2(vLot * 91.0, vLot * 37.0));
        float lit = step(r, 0.34 + 0.5 * vEnergy * (0.5 + 0.9 * glowP));

        // A few flicker slowly; a city with perfectly static windows is dead.
        float flick = 0.75 + 0.25 * sin(time * (0.7 + 3.0 * r) + r * 41.0);

        float hue = fract(0.09 + 0.16 * hash1(idx * 1.7 + vLot)
                          + 0.06 * sin(audioChromaHue));
        vec3 warm = mix(vec3(1.0, 0.82, 0.45), hue2rgb(hue), 0.35);

        col += warm * pane * lit * flick * (0.9 + 1.6 * glowP)
             * (0.7 + 0.6 * audioLevel);

        // Kick runs a bright band UP the towers.
        float sweep = fract(vUp * 0.045 - time * 0.35);
        col += warm * pane * pow(max(1.0 - abs(sweep - 0.5) * 6.0, 0.0), 3.0)
             * audioKick * 1.3;
    }
    else
    {
        // ---- roof ----
        col *= 0.7;
        // Aircraft warning light, blinking on the beat.  Kept dim: this covers
        // the whole roof quad, so at full strength every tower gets a glowing
        // red lid and the roofs become the brightest thing in the frame.
        float r = hash1(vec2(vLot * 13.0, vLot * 71.0));
        if (r > 0.72)
            col += vec3(1.0, 0.12, 0.05)
                 * (0.06 + 0.16 * audioBeat) * (0.4 + 0.9 * glowP);
    }

    // Rim from the sky, so silhouettes separate against the haze.
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    col += skyHi * fres * 2.2;

    // The tallest towers catch a wash of their own band's colour.
    col += hue2rgb(fract(0.55 + 0.3 * vEnergy)) * vEnergy
         * clamp(vUp / max(heightP * 46.0, 1.0), 0.0, 1.0)
         * 0.35 * (0.5 + 1.2 * audioSubBass);

    // Distance haze — the single strongest depth cue in a city at night.
    float haze = clamp(vDist / 210.0, 0.0, 1.0);
    col = mix(col, hazeCol, pow(haze, 1.25));

    col *= 1.0 + 0.16 * audioBeat;
    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
