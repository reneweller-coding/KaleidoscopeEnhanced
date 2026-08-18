#version 330 core
out vec4 fragColor;
// Tonnetz.frag — the harmonic lattice, lit by what is actually being played.
// -----------------------------------------------------------------------
// The Tonnetz is a map of pitch classes on a triangular grid, laid out so that
// the three axes are the three consonant intervals: a perfect fifth one way, a
// major third another, a minor third the third way.  Its point is that TRIADS
// BECOME TRIANGLES — every major and minor chord is one small triangle of the
// lattice, and chords that share notes sit next to each other.
//
// So this is not a decorative grid with music mapped onto it.  A held chord
// lights one triangle; moving to a related chord lights the triangle sharing an
// edge with it; a modulation walks across the plane.  What you see is the
// harmony's own geometry.
// -----------------------------------------------------------------------

uniform sampler2D tex0;
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioChromaHue;
uniform float audioAmbient;
uniform float audioHarmChange;

uniform float zoomP;        // preset: how much of the lattice is on screen
uniform float glowP;        // preset: node brightness
uniform float photoP;
uniform sampler2D tex1;
uniform float audioValence;       // preset: how much of the photo shows through

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

// Pitch class at lattice coordinates (a, b): a steps of a perfect fifth (7
// semitones) and b steps of a major third (4).  That single line is the whole
// Tonnetz — everything else here is drawing.
int pitchAt(vec2 n)
{
    int v = int(mod(n.x * 7.0 + n.y * 4.0, 12.0) + 12.0);
    return v % 12;
}

float energyAt(vec2 n)
{
    // Bins are L1-normalised (~0..0.3), so x4 brings a strong pitch class near 1.
    // Scalar floor: the lattice stays faintly visible from plain level even
    // when no pitch class dominates (quiet passages, headless previews).
    return clamp(0.14 + 0.30 * audioLevel + audioChroma[pitchAt(n)] * 4.0, 0.0, 1.4);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float scale = 2.4 + 6.5 * zoomP;
    // A slow drift and rotation, so the lattice is a plane being wandered over
    // rather than a fixed diagram.
    float ang = 0.10 * sin(audioAdvance * 0.05);
    p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p * scale;
    p += vec2(0.28 * audioAdvance * 0.1, 0.16 * sin(audioAdvance * 0.07));

    // Triangular lattice basis: one axis along x, the other at 60 degrees.
    const vec2 E1 = vec2(1.0, 0.0);
    const vec2 E2 = vec2(0.5, 0.8660254);

    // Solve p = a*E1 + b*E2 for the (a, b) lattice coordinates.
    float b = p.y / 0.8660254;
    float a = p.x - b * 0.5;

    vec3 col = vec3(0.0);

    // The photo, very dark, as the ground the lattice floats over.
    vec3 photo = texture(tex0, uv * 0.9 + 0.05).rgb;
    col += mix(vec3(0.015, 0.018, 0.030), photo * 0.22, photoP)
         * (1.0 + 0.5 * audioAmbient);

    // Walk the nine nearest lattice nodes: draw each node, and the edges and
    // triangle faces it anchors.
    vec2 base = vec2(floor(a), floor(b));
    for (int j = -1; j <= 2; ++j)
        for (int i = -1; i <= 2; ++i)
        {
            vec2 n = base + vec2(float(i), float(j));
            vec2 np = n.x * E1 + n.y * E2;
            float e = energyAt(n);

            float d = length(p - np);

            // Node: a disc whose size and brightness follow its pitch class.
            float r = 0.055 + 0.10 * e;
            float node = smoothstep(r, r * 0.35, d);

            int pc = pitchAt(n);
            // Colour by pitch class around the circle of fifths, which puts
            // harmonically close notes at close hues.
            float hue = fract(float((pc * 7) % 12) / 12.0 + 0.02 * sin(audioChromaHue));
            vec3 tone = hue2rgb(hue);

            col += tone * node * (0.35 + 1.5 * glowP) * (0.25 + 1.3 * e);

            // Halo, so a loud pitch class reads from across the frame.
            col += tone * exp(-d * (7.0 - 3.0 * e)) * e * 0.35 * (0.4 + glowP);

            // Edges to the two forward neighbours.  An edge glows when BOTH its
            // endpoints sound: that is a consonant interval actually present.
            for (int k = 0; k < 2; ++k)
            {
                vec2 m = n + (k == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
                vec2 mp = m.x * E1 + m.y * E2;
                float e2 = energyAt(m);

                vec2 ab = mp - np;
                float t = clamp(dot(p - np, ab) / dot(ab, ab), 0.0, 1.0);
                float dl = length(p - (np + ab * t));

                float pair = min(e, e2);
                float w = 0.006 + 0.014 * pair;
                float line = smoothstep(w, w * 0.3, dl);
                col += mix(tone, hue2rgb(fract(hue + 0.08)), t)
                     * line * pair * (0.5 + 1.2 * glowP);
            }

            // The triad face.  Its three corners are a root, its fifth and its
            // third — a major or minor chord — so filling it when all three
            // sound is literally drawing the chord.
            vec2 m1 = n + vec2(1.0, 0.0);
            vec2 m2 = n + vec2(0.0, 1.0);
            float tri = min(e, min(energyAt(m1), energyAt(m2)));
            if (tri > 0.05)
            {
                vec2 c3 = (np + m1.x * E1 + m1.y * E2 + m2.x * E1 + m2.y * E2) / 3.0;
                float dc = length(p - c3);
                col += hue2rgb(fract(hue + 0.5)) * tri
                     * smoothstep(0.42, 0.05, dc) * 0.55
                     * (0.5 + 1.4 * audioHarmChange + 0.6 * audioKick);
            }
        }

    col *= 1.0 + 0.22 * audioBeat + 0.5 * audioHigh * 0.3;
    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
