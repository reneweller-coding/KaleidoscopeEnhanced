#version 330 core
out vec4 fragColor;
/**
 * @file RibosomeAssemblyLine.frag
 * @brief RIBOSOME ASSEMBLY LINE: translation, seen as the factory it is.
 * An mRNA tape runs steadily through the ribosome (two subunits, centre
 * frame); at each codon the ribosome adds an amino acid -- a round bead
 * coloured by the pitch class that is loudest at that moment -- to the
 * growing chain, which curls away and begins to fold.  The tape carries
 * the photo as its codon pattern; the tRNAs arrive on the clock; the
 * kick lights the peptide bond; the swell is the cytoplasm glow.  Camera
 * still.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> tape motion, tRNA arrivals (continuous)
 *   audioChroma[12] -> bead colours (by the class energies at each bead's index)
 *   audioKick       -> peptide-bond flash (light)
 *   audioSwell      -> cytoplasm glow (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: speedP, curlP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float speedP;
uniform float curlP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float speed = 0.7 + 0.6 * clamp(speedP, 0.0, 1.0);
    float curl = 0.6 + 0.8 * clamp(curlP, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 * speed + sceneTime * 0.1;
    float glow = 0.8 + 0.7 * clamp(audioSwell, 0.0, 1.0);

    // Cytoplasm: the photo soft and warm, with round organelles drifting.
    vec3 col = (interpolation * textureLod(tex0, gl_FragCoord.xy / resolution, 3.0) + (1.0 - interpolation) * textureLod(tex1, gl_FragCoord.xy / resolution, 3.0)).rgb;
    col *= imgPalette(hue * 0.159 + 0.55) * 0.9 * glow + 0.06;
    vec2 ou = (p + vec2(sceneAdvance * 0.01, 0.0)) * 6.0; vec2 oc = floor(ou); vec2 of = fract(ou) - 0.5;
    vec2 oo = vec2(hash21(oc + 1.3), hash21(oc + 5.9)) - 0.5;
    float org = smoothstep(0.3, 0.25, length(of - oo * 0.5)) * step(0.7, hash21(oc));
    col = mix(col, col * 1.4 + 0.05, org * 0.5);

    // The mRNA tape: a band across the middle, moving left; codons as photo
    // tiles with three-letter cells.
    float tapeY = -0.05;
    float tape = smoothstep(0.07, 0.065, abs(p.y - tapeY));
    float tx = p.x + clock * 0.6;
    float codon = floor(tx * 8.0);
    vec3 tapeCol = img(vec2(fract(codon * 0.083), 0.5)) * 0.9 + 0.1;
    float letters = smoothstep(0.2, 0.15, abs(fract(tx * 24.0) - 0.5)) * 0.4;
    tapeCol = mix(tapeCol, vec3(0.9, 0.85, 0.6), letters);
    col = mix(col, tapeCol * glow, tape);

    // The ribosome: two subunits (round blobs) straddling the tape at x = 0.
    float big = smoothstep(0.2, 0.18, length((p - vec2(0.0, tapeY + 0.12)) * vec2(0.8, 1.0)));
    float small = smoothstep(0.14, 0.125, length((p - vec2(0.0, tapeY - 0.1)) * vec2(0.8, 1.0)));
    vec3 ribo = mix(vec3(0.45, 0.4, 0.55), imgPalette(hue * 0.159 + 0.7), 0.4);
    float rshade = 0.5 + 0.5 * (1.0 - length(p - vec2(-0.05, tapeY + 0.15)) * 3.0);
    col = mix(col, ribo * rshade * glow, max(big, small) * 0.9);

    // The growing chain: beads leaving the exit tunnel at the top of the
    // large subunit; bead i was added i codons ago; it lies along a curling
    // path (a spiral that starts to fold), coloured by the class loudest at
    // its index (a hashed class per bead, brightened by that class now).
    float added = clock * 0.6 * 8.0;                 // codons translated so far (continuous)
    float fracBead = fract(added);
    for (int i = 0; i < 40; ++i)
    {
        float fi = float(i) + fracBead;              // age of bead i in codons
        float s = fi * 0.045;
        float ang = 1.57 + s * 3.0 * curl + 0.4 * sin(s * 7.0);
        vec2 bp = vec2(0.0, tapeY + 0.3) + vec2(cos(ang), sin(ang)) * (0.06 + s * 0.9) + vec2(0.0, s * 0.6);
        bp += vec2(0.02 * sin(sceneAdvance * 0.8 + fi), 0.015 * cos(sceneAdvance * 0.7 + fi * 1.3));
        float idx = floor(added) - float(i);
        int k = int(mod(abs(idx) * 7.0, 12.0));
        float e = clamp(audioChroma[k] * 1.5, 0.0, 1.0);
        vec3 bc = imgPalette(hue * 0.159 + float(k) / 12.0) * 1.5 + 0.15;
        float d = length(p - bp);
        float bead = smoothstep(0.03, 0.02, d);
        float link = 0.0;
        if (i > 0)
        {
            float fj = float(i - 1) + fracBead; float sj = fj * 0.045;
            float angj = 1.57 + sj * 3.0 * curl + 0.4 * sin(sj * 7.0);
            vec2 bq = vec2(0.0, tapeY + 0.3) + vec2(cos(angj), sin(angj)) * (0.06 + sj * 0.9) + vec2(0.0, sj * 0.6);
            bq += vec2(0.02 * sin(sceneAdvance * 0.8 + fj), 0.015 * cos(sceneAdvance * 0.7 + fj * 1.3));
            vec2 dd = bq - bp; float t = clamp(dot(p - bp, dd) / dot(dd, dd), 0.0, 1.0);
            link = smoothstep(0.006, 0.002, length(p - (bp + dd * t)));
        }
        col = mix(col, vec3(0.8, 0.8, 0.85) * glow, link * 0.7);
        col = mix(col, bc * (0.5 + 0.7 * e) * glow, bead);
        // The newest bead flashes on the kick (the peptide bond forming).
        if (i == 0) col += bc * exp(-d * 30.0) * audioKick * 1.2;
    }
    // A tRNA arriving: a small L-shape sliding in from the right on the clock.
    float tph = fract(clock * 0.6 * 8.0 * 0.5);
    vec2 tp = vec2(0.5 - tph * 0.45, tapeY - 0.35 + tph * 0.25);
    float trna = smoothstep(0.03, 0.02, length(p - tp)) + smoothstep(0.012, 0.006, abs(p.x - tp.x)) * step(abs(p.y - tp.y - 0.04), 0.05);
    col = mix(col, imgPalette(hue * 0.159 + 0.2) * 1.4 * glow, clamp(trna, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, tph)));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
