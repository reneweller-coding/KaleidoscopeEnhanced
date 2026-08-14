#version 330 core
out vec4 fragColor;
// GrowthTree.frag — bark near the root, sap-lit twigs at the tips, and leaves
// that catch the light from behind.  The depth-along-the-tree value is what
// drives almost everything: a tree looks like a tree because the material
// changes continuously from trunk to leaf.

in vec3  vObj;
in vec3  vNormal;
in vec3  vView;
in float vDepth;      // 0 = trunk, 1 = tip
in float vKind;       // 0 = wood, 1 = leaf

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

uniform float glowP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L = normalize(vec3(0.45, 0.68, -0.58));
    float diff = max(dot(n, L), 0.0);
    float wrap = 0.5 + 0.5 * dot(n, L);

    vec3 col;

    if (vKind > 0.5)
    {
        // --- leaf: thin, so most of its light comes THROUGH it ---
        float hue = fract(0.26 + 0.10 * sin(audioChromaHue) + 0.05 * vObj.y);
        vec3 leaf = mix(vec3(0.10, 0.28, 0.07), hue2rgb(hue), 0.55);
        col = leaf * (0.25 + 0.7 * diff + 0.4 * wrap * wrap);
        float back = pow(max(dot(-n, L), 0.0), 1.6);
        col += vec3(0.55, 0.95, 0.30) * back * (0.6 + 1.1 * audioAmbient);
        col += leaf * (0.3 + 1.4 * audioHigh) * 0.35;
    }
    else
    {
        // --- wood: dark bark at the base, warming toward the growing tips ---
        vec3 bark = mix(vec3(0.20, 0.15, 0.11), vec3(0.46, 0.34, 0.20), vDepth);
        col = bark * (0.30 + 0.95 * diff + 0.55 * wrap * wrap);
        // Cool counter-light: against a black background one key light leaves
        // half the trunk invisible and the tree reads as a flat cut-out.
        col += bark * vec3(0.45, 0.58, 0.95)
             * max(dot(n, normalize(vec3(-0.65, -0.15, -0.6))), 0.0) * 0.45;

        // Sap glow: the young wood at the tips is lit from inside, and the
        // kick runs a surge of it up the tree.
        float surge = clamp(vDepth * 1.4 - 0.35, 0.0, 1.0);
        vec3 sap = hue2rgb(fract(0.09 + 0.12 * sin(audioChromaHue)));
        col += sap * pow(surge, 2.0) * (0.35 + 1.0 * glowP)
             * (0.45 + 1.4 * audioKick + 0.5 * audioSubBass);
    }

    // Rim against the dark background, plus a hint of the photo as sky light.
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    vec3 R = reflect(-V, n);
    vec2 skyUV = vec2(atan(R.x, R.z) / 6.2831853 + 0.5, clamp(R.y * 0.5 + 0.5, 0.0, 1.0));
    vec3 sky = textureLod(tex0, fract(skyUV), 0.0).rgb;
    sky = mix(vec3(dot(sky, vec3(0.333))), sky, 0.5);
    col += sky * fres * 0.32 * (0.6 + 0.6 * audioLevel);

    col *= 1.0 + 0.18 * audioBeat;
    col = col / (1.0 + col * 0.28);
    fragColor = vec4(col, interpolation);
}
