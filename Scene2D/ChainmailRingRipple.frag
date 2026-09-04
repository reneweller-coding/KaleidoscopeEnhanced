#version 330 core
out vec4 fragColor;
/**
 * @file ChainmailRingRipple.frag
 * @brief CHAINMAIL RING RIPPLE: a sheet of European 4-in-1 mail filling
 * the frame.  Every ring is a torus seen at an angle, threaded through
 * four of its neighbours, so the sheet reads as interlocking metal rather
 * than a pattern of circles.  A ripple travels across it on the scene
 * clock, tilting the rings it passes and running a band of highlight with
 * it; each ring's polish takes the colour of one spectrum band, and the
 * kick sends a glint wave from the centre.  Camera fixed on the mail.
 *
 * Audio Reactivity:
 *   sceneAdvance      -> the ripple travels (continuous)
 *   audioSpectrum[32] -> ring colour by column (light)
 *   audioKick         -> a glint wave from the centre (light)
 *   audioHigh         -> the polish (light)
 *   audioSwell        -> the lamp (slow)
 *
 * Per-activation variety: gaugeP, weaveP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float gaugeP;
uniform float weaveP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// One ring: an ellipse of wire.  Returns the coverage and, through the
// out parameters, where on the wire we are (for shading) and how far
// round the ring (for the highlight).
float ringAt(vec2 q, float rad, float wire, float squash, out float across, out float around)
{
    vec2 e = vec2(q.x, q.y / max(squash, 0.05));
    float r = length(e);
    float d = abs(r - rad) - wire;
    across = clamp((r - rad) / max(wire, 1e-3), -1.0, 1.0);
    around = atan(e.y, e.x);
    return smoothstep(0.004, -0.004, d);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float gauge = 9.0 + 7.0 * clamp(gaugeP, 0.0, 1.0);                  // rings across
    float squashBase = 0.5 + 0.25 * clamp(weaveP, 0.0, 1.0);
    float lamp = 0.65 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The backing behind the mail: a dark padded gambeson from the photo.
    vec3 col = img(uv) * mix(vec3(0.12, 0.11, 0.1), imgPalette(hue * 0.159 + 0.1) * 0.25, 0.45) * lamp;

    // The ripple: a travelling band across the sheet.  It tilts the rings
    // it passes -- a smooth function of position, so nothing snaps.
    float wave = sin((p.x * 1.6 + p.y * 0.8) * 3.0 - clock * 1.4);
    float band = exp(-pow(wave - 1.0, 2.0) * 1.2);
    // The kick's glint wave: a ring of brightness expanding from the centre
    // on its own continuous phase, so the kick lights it but never moves it.
    float glintR = fract(clock * 0.35) * 1.4;
    float glintWave = exp(-abs(length(p) - glintR) * 9.0) * (1.0 - fract(clock * 0.35));

    // The mail lattice: rows of rings, every other row offset, and the
    // rings of one row thread through the row above.
    float pitchX = aspect * 2.0 / gauge;
    float pitchY = pitchX * 0.46;
    // Two passes: the under-rings first, then the over-rings, which is what
    // makes 4-in-1 read as interlocked and not as overlapping discs.
    for (int pass = 0; pass < 2; ++pass)
    {
        float rowOff = float(pass) * 0.5;
        vec2 g = vec2((p.x + aspect) / pitchX - rowOff, (p.y + 0.5) / pitchY);
        // Only every other row belongs to this pass.
        float rowSel = mod(floor(g.y), 2.0);
        if ((pass == 0 && rowSel > 0.5) || (pass == 1 && rowSel < 0.5))
        {
            // fall through: the other pass draws this row
        }
        for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx)
        {
            vec2 ci = floor(g) + vec2(float(dx), float(dy));
            if (mod(ci.y, 2.0) != float(pass)) continue;
            vec2 centre = vec2((ci.x + 0.5 + rowOff) * pitchX - aspect, (ci.y + 0.5) * pitchY - 0.5);
            vec2 q = p - centre;
            // The ripple tilts this ring: the squash changes with the wave
            // at the ring's own position, so the tilt travels smoothly.
            float w2 = sin((centre.x * 1.6 + centre.y * 0.8) * 3.0 - clock * 1.4);
            float squash = squashBase * (1.0 - 0.35 * w2);
            float rad = pitchX * 0.47;
            float wire = pitchX * 0.085;
            float across, around;
            float ring = ringAt(q, rad, wire, squash, across, around);
            if (ring < 0.002) continue;
            // Colour: one spectrum band per column.
            int b = int(mod(ci.x * 2.0 + ci.y, 32.0));
            float e = clamp(audioSpectrum[b] * 1.6, 0.0, 1.0);
            vec3 steel = mix(vec3(0.55, 0.57, 0.6), imgPalette(hue * 0.159 + float(b) / 32.0), 0.22 + 0.3 * e);
            // Round wire shading: bright along the upper inner edge.
            float shade = 0.35 + 0.75 * sqrt(max(1.0 - across * across, 0.0));
            // The lamp sits up and to the left, so the ring is bright there.
            float lit = 0.5 + 0.6 * cos(around - 2.2);
            vec3 ringCol = steel * shade * (0.45 + 0.75 * lit) * lamp;
            // The travelling highlight band.
            float bandHere = exp(-pow(w2 - 1.0, 2.0) * 1.2);
            ringCol += vec3(1.0, 0.98, 0.95) * bandHere * shade * (0.25 + 0.6 * hi) * 0.8;
            // The kick's glint wave.
            ringCol += vec3(1.0) * glintWave * shade * (0.2 + 1.3 * audioKick) * 0.7;
            // Contact shadow where this ring lies over its neighbour.
            float contact = smoothstep(wire * 2.2, wire, abs(abs(q.x) - rad * 0.9));
            col *= 1.0 - 0.3 * contact * ring;
            col = mix(col, ringCol, ring);
        }
    }
    // A slight overall vignette so the sheet has a body.
    col *= 0.85 + 0.2 * (1.0 - length(p) * 0.6);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
