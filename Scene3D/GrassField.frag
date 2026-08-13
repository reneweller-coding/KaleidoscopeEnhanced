#version 330 core
out vec4 fragColor;
// GrassField.frag — three materials in one shader, chosen by vKind.
// The blade shading is mostly ambient occlusion along its own length: grass
// reads as grass because the base sits in shadow and only the tips catch the
// sun.  Flat-lit blades look like green plastic straws.

in vec3  vWorld;
in vec3  vNormal;
in float vAlong;
in float vTint;
in float vKind;

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioHigh;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float camHP;
uniform float hueP;
uniform float skyP;

void main()
{
    // Sun kept low so the blades throw long, warm highlights.
    vec3 L = normalize(vec3(0.42, 0.30, -0.86));
    vec3 skyLo = vec3(0.10, 0.13, 0.20);
    vec3 skyHi = vec3(0.26, 0.36, 0.55) * (0.5 + 1.1 * skyP);
    // One haze colour for BOTH the ground and the blades, reaching full well
    // before the field ends.  Otherwise the last row of blades stops in mid-air
    // and the sward reads as a hedge with a cut edge.
    vec3 hazeCol = skyHi * 0.8;
    const float HAZE_D = 38.0;
    vec3 col;

    if (vKind < 0.5)
    {
        // --- sky: the slideshow photo, heavily softened, over a gradient ---
        vec2 uv = vWorld.xy * 0.5 + 0.5;
        vec3 photo = textureLod(tex0, fract(uv * vec2(1.0, 0.55) +
                                            vec2(time * 0.004, 0.25)), 0.0).rgb;
        photo = mix(vec3(dot(photo, vec3(0.333))), photo, 0.65);
        float g = clamp(uv.y, 0.0, 1.0);
        col = mix(skyLo, skyHi, g);
        col = mix(col, col * 0.7 + photo * 0.35, 0.45 * skyP);
        col += vec3(1.0, 0.75, 0.45) * pow(max(1.0 - abs(uv.y - 0.42) * 3.0, 0.0), 3.0)
             * (0.25 + 0.6 * audioLevel);
    }
    else if (vKind < 1.5)
    {
        // --- ground: dark soil near, distant lawn beyond the last blade ---
        float d = clamp(vWorld.z / HAZE_D, 0.0, 1.0);
        vec3 soil = vec3(0.030, 0.042, 0.022) * (1.0 + 0.5 * audioAmbient);
        vec3 lawn = vec3(0.075, 0.155, 0.055);   // what a dense sward averages to
        col = mix(soil, lawn, smoothstep(0.05, 0.5, d));
        col = mix(col, hazeCol, pow(d, 1.3));
    }
    else
    {
        // --- blade ---
        vec3 n = normalize(vNormal);
        float diff = max(dot(n, L), 0.0);
        float wrap = 0.5 + 0.5 * dot(n, L);

        // Occlusion along the blade: the base of a dense sward sees almost no
        // sky.  This single term does most of the work — but the floor has to
        // stay well above zero, or the field turns into one black mat as soon
        // as the camera looks down into it.
        float ao = 0.34 + 0.66 * vAlong * vAlong;

        // Large-scale patchiness.  Real turf is never one flat tone; without
        // this the whole sward reads as felt no matter how good the blades are.
        float patch = 0.72
                    + 0.20 * sin(vWorld.x * 0.21 + vWorld.z * 0.13)
                    + 0.14 * sin(vWorld.x * 0.07 - vWorld.z * 0.31 + 2.1);

        vec3 deep = vec3(0.055, 0.130, 0.048);
        vec3 lush = vec3(0.34, 0.68, 0.18);
        vec3 dry  = vec3(0.68, 0.64, 0.24);
        vec3 base = mix(deep, mix(lush, dry, vTint * 0.55 + 0.15 * hueP), vAlong);
        base *= patch;

        col = base * ao * (0.30 + 0.95 * diff + 0.50 * wrap * wrap);

        // Sky ambient — a hemisphere term, so upward-facing blades pick up the
        // same light the backdrop is made of and the field sits in its scene.
        col += base * skyHi * ao * (0.45 + 0.55 * max(n.y, 0.0));

        // Translucency: grass is thin enough that the sun shines THROUGH the
        // blades that face away, which is the effect that sells a backlit lawn.
        float back = pow(max(dot(-n, L), 0.0), 2.0);
        col += vec3(0.55, 0.85, 0.22) * back * ao * (0.45 + 0.9 * audioAmbient);

        // Specular sheen on the tips, sharpened by the treble.
        vec3 V = normalize(vec3(0.0, camHP, 0.0) - vWorld);
        vec3 H = normalize(L + V);
        col += vec3(0.9, 1.0, 0.7) * pow(max(dot(n, H), 0.0), 26.0)
             * vAlong * (0.30 + 1.5 * audioHigh);

        // The kick runs a bright band of light across the field.
        float sweep = fract(vWorld.z * 0.035 - time * 0.11);
        col += lush * pow(max(1.0 - abs(sweep - 0.5) * 5.0, 0.0), 3.0)
             * vAlong * audioKick * 1.1;

        float haze = clamp(vWorld.z / HAZE_D, 0.0, 1.0);
        col = mix(col, hazeCol, pow(haze, 1.3));
    }

    // Bounded hue nudge — a full turn would take the lawn to magenta.
    float hr = 0.09 * sin(audioChromaHue);
    col.rg = mat2(cos(hr), -sin(hr), sin(hr), cos(hr)) * col.rg;

    col *= 1.0 + 0.16 * audioBeat + 0.12 * audioSubBass;
    col = col / (1.0 + col * 0.26);
    fragColor = vec4(col, interpolation);
}
