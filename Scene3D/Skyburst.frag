#version 330 core
out vec4 fragColor;
// Skyburst.frag — sparks are emissive, so there is no lighting here at all.
// What there IS: a colour that cools along the trail.  A burning ember goes
// from white-hot through yellow to red as it loses heat, and reproducing that
// gradient along each streak is what separates a firework from confetti.

in vec3  vWorld;
in float vAge;         // 0 at the spark's head, 1 at the tail
in float vHue;
in float vBright;
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

uniform float glowP;
uniform float skyP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hue2rgb(float h)
{
    return imgPalette(h) * 1.35;   // photo-arc palette (house standard), was HSV rainbow
}

void main()
{
    // Blackbody-ish cooling: white at the head, the shell's own colour in the
    // middle, deep red at the tail.
    vec3 shell = hue2rgb(fract(vHue + 0.04 * sin(audioChromaHue)));
    vec3 col = mix(vec3(1.0, 0.97, 0.90), shell, smoothstep(0.0, 0.45, vAge));
    col = mix(col, vec3(0.55, 0.10, 0.02), smoothstep(0.55, 1.0, vAge));

    col *= vBright * (1.6 + 3.2 * glowP) * (0.7 + 0.8 * audioLevel);

    // The head of each streak burns out white, which is what makes a dense
    // burst read as light rather than as coloured lines.
    col += vec3(1.0) * pow(max(1.0 - vAge * 2.2, 0.0), 3.0)
         * vBright * (0.5 + 1.8 * audioHigh);

    // A faint night sky and haze, so the sparks sit in air rather than in a
    // vacuum.  The slideshow photo shows through very dimly, low on the frame.
    vec2 suv = vec2(vWorld.x / 90.0 + 0.5, clamp(vWorld.y / 40.0, 0.0, 1.0));
    vec3 photo = textureLod(tex0, fract(suv * vec2(1.0, 0.4) + vec2(time * 0.003, 0.0)), 0.0).rgb;
    vec3 sky = mix(vec3(0.012, 0.016, 0.032), vec3(0.05, 0.06, 0.10), suv.y);
    sky = mix(sky, sky * 0.6 + photo * 0.18, 0.5 * skyP) * (1.0 + 0.6 * audioAmbient);

    float haze = clamp(vDist / 90.0, 0.0, 1.0);
    col = mix(col, col * 0.5 + sky, pow(haze, 1.5) * 0.6);
    col += sky * 0.5;

    col *= 1.0 + 0.22 * audioBeat + 0.16 * audioSubBass + 0.2 * audioKick;
    col = col / (1.0 + col * 0.22);
    fragColor = vec4(col, interpolation);
}
