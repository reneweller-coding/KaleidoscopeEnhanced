#version 330 core
out vec4 fragColor;
/**
 * @file IceCrack.frag
 * @brief The photograph seen through a sheet of ice that keeps shattering into Voronoi shards, each shard refracting the picture like a separate slab of glass.
 *
 * The crack lines use a two-pass Voronoi, a true bisector distance rather than the naive F2-F1 gap, so every crack keeps an even width even where three shards meet. audioKick and audioSubBass drive a shatter impulse that widens the cracks and pushes each shard outward from its seed; the seeds themselves drift permanently on audioAdvance, never on raw time, so they stay jump-free. audioAmbient thickens the frost gathering along the cracks, audioBeat and audioLevel lift overall brightness, audioHigh adds a touch of crack-coloured sparkle, and the crack colour comes from an imgPalette arc rotated by audioChromaHue with audioValence setting its saturation.
 */
// IceCrack.frag — the photograph behind a sheet of ice that keeps breaking.
// -----------------------------------------------------------------------
// The shards are a Voronoi tessellation, and getting a clean crack out of one is
// the whole problem.  The usual trick is to take F2 - F1, the gap between the
// distances to the two nearest seeds, and treat small values as "near an edge".
// That is not the distance to the edge.  Where two cells meet head-on it is
// roughly right; where they meet at a shallow angle it is far too large, so the
// crack swells into a broad smear exactly at the junctions where three shards
// come together — which is where the eye looks.
//
// The correct distance needs a second pass: for every neighbouring seed, the
// perpendicular distance from this pixel to the bisector between it and the
// winning seed.  The smallest of those IS the distance to the cell wall, and it
// gives a line of even width everywhere.  It costs a second nine-cell loop and
// it is the difference between cracked ice and a dirty window.
//
// Each shard also refracts what is behind it: a small uv offset, constant within
// the shard and different between them, which is what a broken pane does and
// what makes the pieces read as separate slabs of glass rather than as a drawn
// pattern.
// -----------------------------------------------------------------------

uniform sampler2D tex0;
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioAdvance;
uniform float audioAmbient;
uniform float audioChromaHue;

uniform float shardP;       // preset: shard size
uniform float crackP;       // preset: crack width and brightness
uniform float refractP;
uniform sampler2D tex1;
uniform float audioValence;     // preset: how much each shard bends the image

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

vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 p = vec2(uv.x * aspect, uv.y);

    float cells = mix(16.0, 5.0, clamp(shardP, 0.0, 1.0));
    // The whole sheet DRIFTS slowly over the picture -- pack ice on a
    // current. Steady time base; audioAdvance alone froze on quiet parts
    // and the scene read as a still photo that twitched to the beat.
    vec2 g = (p + vec2(time * 0.014 + audioAdvance * 0.02, time * 0.006)) * cells;
    vec2 gi = floor(g);
    vec2 gf = fract(g);

    // ---- pass one: which seed owns this pixel ----
    vec2 bestOff = vec2(0.0);
    vec2 bestSeed = vec2(0.0);
    float bestD = 1e9;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x)
        {
            vec2 o = vec2(float(x), float(y));
            // The seeds drift, slowly and permanently, so the sheet is never the
            // same twice.  audioAdvance, not time scaled by a level, or every
            // shard would jump whenever the music got louder.
            vec2 h = hash22(gi + o);
            vec2 s = o + 0.5 + 0.42 * sin(time * 0.10 + audioAdvance * 0.12 + 6.2831853 * h);
            float d = dot(s - gf, s - gf);
            if (d < bestD) { bestD = d; bestOff = o; bestSeed = s; }
        }

    // ---- pass two: distance to the wall, not to the other seed ----
    float wall = 1e9;
    for (int y = -2; y <= 2; ++y)
        for (int x = -2; x <= 2; ++x)
        {
            vec2 o = vec2(float(x), float(y));
            vec2 h = hash22(gi + o);
            vec2 s = o + 0.5 + 0.42 * sin(time * 0.10 + audioAdvance * 0.12 + 6.2831853 * h);
            vec2 diff = s - bestSeed;
            float len = length(diff);
            if (len < 1e-4)
                continue;                       // the winning seed itself
            // Perpendicular distance from the pixel to the bisector.
            wall = min(wall, dot(0.5 * (s + bestSeed) - gf, diff / len));
        }

    // The shard's own identity, used for its refraction and its tilt.
    vec2 id = gi + bestOff;
    vec2 rnd = hash22(id * 1.37 + 4.1);

    // A shatter impulse: the sheet breaks harder on kicks, and the shards ride
    // outward from their seed while it decays.
    float shatter = clamp(0.25 + 1.5 * audioKick + 0.5 * audioSubBass, 0.0, 2.0);

    vec2 outward = normalize(gf - bestSeed + vec2(1e-4));
    vec2 refr = (rnd - 0.5) * (0.010 + 0.030 * clamp(refractP, 0.0, 2.0))
              + outward * 0.004 * shatter;
    vec2 suv = clamp(uv + refr, vec2(0.001), vec2(0.999));

    vec3 base = texture(tex0, suv).rgb;

    // Ice: cold, slightly desaturated, brighter where the shard tilts to catch
    // the light.
    float tilt = 0.75 + 0.5 * rnd.x;
    vec3 ice = mix(base, vec3(0.72, 0.85, 1.0) * dot(base, vec3(0.33)), 0.30);
    ice *= tilt;

    // The crack itself.  Width in cell units, so it stays even as the shards
    // change size.
    float w = (0.012 + 0.030 * clamp(crackP, 0.0, 2.0)) * (0.7 + 0.6 * shatter);
    float line = 1.0 - smoothstep(0.0, w, wall);

    // A crack in ice is not a dark line: it is a thin air gap that scatters, so
    // it reads BRIGHTER than the ice around it, with a dark core where the two
    // faces have parted.
    vec3 crackCol = mix(vec3(0.85, 0.94, 1.0),
                        hue2rgb(fract(0.55 + 0.12 * sin(audioChromaHue))), 0.28);
    float core = 1.0 - smoothstep(0.0, w * 0.35, wall);

    vec3 col = ice;
    col = mix(col, crackCol * (1.2 + 1.8 * clamp(crackP, 0.0, 2.0)), line * 0.85);
    col = mix(col, vec3(0.02, 0.05, 0.09), core * 0.55);

    // Frost gathers along the cracks and thins toward the middle of a shard.
    float frost = pow(1.0 - clamp(wall * 6.0, 0.0, 1.0), 2.0);
    col += vec3(0.55, 0.70, 0.90) * frost * 0.16 * (0.5 + 0.9 * audioAmbient);

    col *= 1.0 + 0.18 * audioBeat + 0.12 * audioLevel;
    col += crackCol * 0.06 * audioHigh;
    col = col / (1.0 + col * 0.16);
    fragColor = vec4(col, interpolation);
}
