#version 330 core
out vec4 fragColor;
// VoronoiShatter.frag — the photograph breaking into Voronoi shards.
// -----------------------------------------------------------------------
// A Voronoi diagram is what a real fracture pattern looks like, because both
// come from the same rule: every point belongs to the nearest seed / the
// nearest crack nucleus.  So the cells here are not a decoration on top of the
// image — they ARE the break.
//
// Each cell then samples the photo through its OWN transform: shifted, rotated
// and scaled about its own centre.  That is the difference between a shattered
// picture and a picture with cracks drawn on it: a real shard carries its piece
// of the image away with it, and the seams stop lining up.
// -----------------------------------------------------------------------

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioDrop;
uniform float audioBuildUp;
uniform float audioAdvance;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;

uniform float cellsP;       // preset: shard count
uniform float flyP;         // preset: how far shards travel
uniform float edgeP;        // preset: crack brightness

vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 p = vec2(uv.x * aspect, uv.y);

    float scale = 4.0 + 16.0 * cellsP;
    vec2 gp = p * scale;
    vec2 gi = floor(gp);
    vec2 gf = fract(gp);

    // Find the nearest seed AND the second nearest.  The second is what makes
    // the crack: the difference between the two distances is small exactly on
    // the boundary between cells, and nowhere else.
    vec2 bestSeed = vec2(0.0), bestOff = vec2(0.0);
    float d1 = 1e9, d2 = 1e9;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x)
        {
            vec2 o = vec2(float(x), float(y));
            vec2 h = hash22(gi + o);
            // Seeds drift slowly, so the fracture pattern is never the same twice.
            vec2 seed = o + 0.5 + 0.42 * sin(audioAdvance * 0.25 + 6.2831853 * h);
            float d = length(seed - gf);
            if (d < d1)
            {
                d2 = d1; d1 = d;
                bestSeed = gi + o; bestOff = seed;
            }
            else if (d < d2) d2 = d;
        }

    vec2 cellCentre = (gi + bestOff - gf + gp) / scale;
    cellCentre.x /= aspect;

    vec4 rnd = vec4(hash22(bestSeed), hash22(bestSeed + 17.3));

    // How far this frame has thrown the shards.  Drops blow it wide open and
    // a build-up loosens everything in advance; the kick only nudges it --
    // it used to jolt as hard as a drop, so the shards re-shattered on every
    // single beat instead of holding together between the real dramatic
    // moments.
    float blast = flyP * (0.05 + 0.55 * audioDrop + 0.12 * audioKick
                               + 0.30 * audioBuildUp + 0.06 * audioSubBass);

    // Each shard flies outward from the frame's centre, spins about its own
    // centre, and drifts back.  Flying along a shared direction would slide the
    // whole image; radial motion is what reads as breaking apart.
    vec2 dir = normalize(cellCentre - vec2(0.5) + 1e-4);
    vec2 offset = dir * blast * (0.35 + 1.2 * rnd.x)
                + (rnd.zw - 0.5) * blast * 0.6;

    float spin = blast * (rnd.y - 0.5) * 2.0;
    float cs = cos(spin), sn = sin(spin);
    mat2 rot = mat2(cs, -sn, sn, cs);

    // Sample the photo through the shard's own frame: undo the shard's motion,
    // so the image travels WITH the piece.
    vec2 local = uv - cellCentre;
    local.x *= aspect;
    local = rot * local * (1.0 - 0.10 * blast);
    local.x /= aspect;
    vec2 suv = cellCentre + local - offset;

    // Outside the frame there is no photo; mirroring keeps the shard filled
    // with plausible content instead of clamping to a smear of edge pixels.
    vec2 muv = abs(fract(suv * 0.5) * 2.0 - 1.0);

    vec3 col = texture(tex0, muv).rgb;

    // Shade each shard by its own tilt, so the field reads as solid pieces
    // catching light rather than as a flat collage.
    float facet = 0.75 + 0.45 * sin(rnd.y * 12.0 + spin * 1.7);
    col *= facet;

    // The crack.  d2 - d1 is the distance to the cell boundary.
    float edge = d2 - d1;
    float crack = 1.0 - smoothstep(0.0, 0.055 + 0.05 * blast, edge);

    // Cracks are dark where the shards still touch and GLOW once they part —
    // the gap between them is where the light behind gets through.
    vec3 glow = hue2rgb(fract(0.06 + 0.12 * sin(audioChromaHue) + 0.2 * rnd.x));
    col = mix(col, vec3(0.02), crack * 0.85 * (1.0 - min(blast * 3.0, 1.0)));
    col += glow * crack * min(blast * 3.0, 1.0)
         * (0.6 + 1.6 * edgeP) * (0.5 + 1.4 * audioHigh);

    col *= 1.0 + 0.20 * audioBeat + 0.15 * audioLevel;
    col = col / (1.0 + col * 0.18);
    fragColor = vec4(col, interpolation);
}
