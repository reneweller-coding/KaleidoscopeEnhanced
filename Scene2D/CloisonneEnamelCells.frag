#version 330 core
out vec4 fragColor;
/**
 * @file CloisonneEnamelCells.frag
 * @brief CLOISONNE ENAMEL CELLS: a copper plate with gold wires bent into
 * a scrolling pattern, the compartments between them filled with coloured
 * enamel.  Over the scene arc the cells are filled one after another and
 * then fired: the enamel sinks, wets out and comes up glassy, so each
 * cell goes from powder to a domed pane of colour.  The chroma classes
 * pick the enamels, the treble is the gold wire catching the light, and
 * the swell is the light in the workshop.  Camera fixed above the plate.
 *
 * Audio Reactivity:
 *   sceneProgress   -> cells fill and fire (the arc)
 *   audioChroma[12] -> the enamel colours (light)
 *   audioHigh       -> the gold wire's shine (light)
 *   audioSwell      -> the workshop light (slow)
 *   audioKick       -> a spark from the kiln lights one cell (light)
 *
 * Per-activation variety: cellsP, wireP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float cellsP;
uniform float wireP;
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
vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Voronoi over a swirled coordinate: the cells then follow the scroll of
// the pattern instead of sitting on a grid.
void cellAt(vec2 x, out float seam, out float id, out vec2 centre, out float toCentre)
{
    vec2 n = floor(x), f = fract(x);
    float d1 = 8.0, d2 = 8.0; id = 0.0; centre = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 g = vec2(float(i), float(j));
        vec2 h = hash22(n + g);
        vec2 r = g + h - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h.x; centre = n + g + h; }
        else if (d < d2) { d2 = d; }
    }
    seam = sqrt(d2) - sqrt(d1);
    toCentre = sqrt(d1);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float cells = 7.0 + 6.0 * clamp(cellsP, 0.0, 1.0);
    float wireW = 0.012 + 0.014 * clamp(wireP, 0.0, 1.0);
    float lamp = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.45 + sceneTime * 0.09;

    // The copper plate: warm metal with a hammered surface, the photo as
    // its patina.
    vec3 copper = mix(vec3(0.62, 0.34, 0.2), imgPalette(hue * 0.159 + 0.06), 0.25);
    copper *= 0.75 + 0.4 * noise2(p * 22.0);
    copper = mix(copper, copper * (0.6 + 0.9 * img(uv)), 0.35);
    vec3 col = copper * lamp * 0.8;

    // The scroll: the cell field is laid on a swirled coordinate, so the
    // compartments curl around the plate like a drawn design.
    float r = length(p);
    float a = atan(p.y, p.x) + r * 2.2;
    vec2 swirl = vec2(cos(a), sin(a)) * r;
    float seam, id; vec2 centre; float toCentre;
    cellAt(swirl * cells + 5.3, seam, id, centre, toCentre);

    // Fill order: cells fill by their distance from the plate's centre, so
    // the work spreads outward.  Each has its own slice of the arc.
    float centreR = length(centre / cells);
    float fillFront = smoothstep(0.0, 0.7, prog) * 1.1;
    float filled = smoothstep(fillFront + 0.1, fillFront - 0.1, centreR);
    // Firing follows a little later: the enamel sinks and comes up glassy.
    float fireFront = smoothstep(0.2, 0.95, prog) * 1.15;
    float fired = smoothstep(fireFront + 0.1, fireFront - 0.1, centreR);

    // The enamel in this cell.
    int cls = int(mod(floor(id * 12.0), 12.0));
    float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
    vec3 enamel = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.35 + 0.12;
    enamel *= 0.7 + 0.6 * e;
    // Unfired it is a matt powder; fired it is a glassy dome.
    float dome = 1.0 - smoothstep(0.0, 0.55, toCentre);
    vec3 powder = enamel * 0.75 * (0.85 + 0.25 * noise2(swirl * 90.0));
    vec3 glass = enamel * (0.6 + 0.7 * dome);
    // The glass catches a highlight up and to the left of each cell's centre.
    vec2 toHi = (p - centre / cells * 1.0);
    glass += vec3(1.0, 0.98, 0.95) * exp(-length(toHi + vec2(0.012, -0.012)) * 55.0) * (0.4 + 0.8 * hi);
    // A little of the copper shows through the thin enamel at the rim.
    glass = mix(copper * 1.2, glass, smoothstep(0.0, 0.25, toCentre * 2.0));
    vec3 cellCol = mix(powder, glass, fired);
    float inCell = smoothstep(wireW * 0.9, wireW * 1.6, seam) * filled;
    col = mix(col, cellCol * lamp, inCell);
    // A spark from the kiln lights one cell at a time on the kick.
    float sparkCell = step(0.93, hash21(vec2(id, floor(clock * 0.7))));
    col += enamel * inCell * sparkCell * audioKick * 0.7;

    // The gold wire: the cloison itself, standing proud of the enamel.
    float wire = smoothstep(wireW * 1.5, wireW * 0.6, seam);
    vec3 gold = mix(vec3(1.0, 0.82, 0.35), imgPalette(hue * 0.159 + 0.12), 0.25);
    // Round wire: bright along its crown, dark at its feet.
    float crown = smoothstep(wireW * 1.2, 0.0, seam);
    vec3 wireCol = gold * (0.45 + 0.85 * crown) * lamp;
    wireCol += vec3(1.0, 0.98, 0.9) * pow(crown, 3.0) * (0.35 + 0.9 * hi);
    // The shadow the wire casts into the cell beside it.
    col *= 1.0 - 0.35 * smoothstep(wireW * 2.4, wireW * 1.4, seam) * (1.0 - wire) * filled;
    col = mix(col, wireCol, wire);
    // The plate's rim.
    float rim = smoothstep(0.47, 0.46, length(p * vec2(1.0, 1.05)));
    col = mix(copper * lamp * 0.5, col, rim);
    col += gold * smoothstep(0.008, 0.0, abs(length(p * vec2(1.0, 1.05)) - 0.465)) * (0.4 + 0.6 * hi);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
