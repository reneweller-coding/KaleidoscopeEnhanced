#version 330 core
out vec4 fragColor;
/**
 * @file DiamondFireMacro.frag
 * @brief DIAMOND FIRE MACRO: a brilliant-cut diamond seen from above,
 * filling the frame -- the table in the middle, the star and kite facets
 * around it, the crown facets out to the girdle.  Every facet mirrors the
 * photo at its own angle, and the stone's dispersion splits white light
 * into spectral "fire": small flashes of pure colour that move across the
 * facets as the light source circles slowly overhead.  The facets keep
 * still; the light moves, and the music is how brightly the fire burns.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> fire intensity on each facet ring, band by band
 *   audioHigh         -> scintillation sparks (light)
 *   audioSwell        -> overall brilliance (slow)
 *   sceneTime         -> the light circling overhead (continuous)
 *
 * Per-activation variety: cutP (number of facets), hueP.
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
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float cutP;
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

// Spectral colour for a dispersion angle (the fire is the spectrum itself,
// a documented rainbow identity, V8b).
vec3 spectral(float x)
{
    return clamp(abs(fract(x + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float N = 8.0 + floor(clamp(cutP, 0.0, 1.0) * 2.0) * 4.0;          // 8, 12 or 16-fold

    // The stone is larger than the frame: we look into the crown.
    float R = 0.95;
    float r = length(p) / R;
    float a = atan(p.y, p.x);
    float sector = 6.2831853 / N;
    float ai = floor(a / sector);
    float af = fract(a / sector);                 // 0..1 across the sector
    float m = abs(af - 0.5) * 2.0;                // 0 in the middle, 1 at the edge

    // Facet rings: table, star facets, kite facets, upper-girdle facets.
    float table = 0.38;
    // Star facets: triangles pointing out from the table edge.
    float starEdge = table + (0.62 - table) * (1.0 - m);
    float kiteEdge = 0.62 + 0.32 * (1.0 - abs(m - 0.5) * 2.0);
    float ring;          // 0 table, 1 star, 2 kite, 3 upper girdle
    vec2 fid;            // facet id
    if (r < table * (0.95 + 0.05 * cos(a * N))) { ring = 0.0; fid = vec2(0.0); }
    else if (r < starEdge) { ring = 1.0; fid = vec2(ai, 1.0); }
    else if (r < kiteEdge) { ring = 2.0; fid = vec2(floor(a / sector + 0.5), 2.0); }
    else { ring = 3.0; fid = vec2(floor(a / sector * 2.0), 3.0); }

    // Each facet has its own normal tilt: the table faces up, the crown
    // facets lean outward more with each ring.
    float tiltA = (ring == 0.0) ? 0.0 : (0.35 + 0.18 * ring);
    float fa = (fid.x + 0.5) * sector * (ring == 3.0 ? 0.5 : 1.0) + (ring == 2.0 ? -0.5 * sector : 0.0);
    vec3 n = normalize(vec3(cos(fa) * sin(tiltA), sin(fa) * sin(tiltA), cos(tiltA)));

    // Light circling overhead.
    float la = sceneTime * 0.25;
    vec3 L = normalize(vec3(cos(la) * 0.6, sin(la) * 0.6, 1.0));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(n, H), 0.0), 60.0);

    // What each facet mirrors: the photo, seen through the pavilion's
    // repeated internal reflections -- a kaleidoscope of the photo, darker
    // and bluish in the depth.
    vec2 refl = n.xy * 0.8 + 0.5 + vec2(hash21(fid), hash21(fid + 3.0)) * 0.25;
    // A diamond photographed shows a sharp black-and-white mosaic: each
    // facet sees either the bright surroundings or the dark camera, split by
    // the pavilion's arrows reflected inside it.
    vec3 body = img(fract(refl));
    float g = dot(body, vec3(0.333));
    float arrows = step(0.5, fract((a / sector) * 2.0 + 0.25 + (ring == 0.0 ? 0.0 : hash21(fid))));
    float bright = step(0.45, hash21(fid + 7.0)) * 0.8 + arrows * 0.35;
    body = mix(vec3(0.02), vec3(0.85, 0.88, 0.92) * (0.6 + 0.5 * g), clamp(bright, 0.0, 1.0));
    body *= mix(vec3(1.0), imgPalette(hue * 0.159 + 0.6) * 1.2, 0.12);

    // Fire: dispersion flashes.  Each facet throws its colour where its
    // reflected light direction is close to the viewer, and that colour
    // shifts with the angle -- so as the light circles, flashes travel.
    float disp = dot(n.xy, L.xy) * 3.0 + hash21(fid + 11.0);
    vec3 fireC = spectral(disp);
    int band = int(mod(ring * 8.0 + fid.x, 32.0));
    float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
    // Fire is sparse: only a few facets flash at a time, as the light moves
    // over them, and the flash is a patch inside the facet, not the whole of it.
    float flashF = smoothstep(0.82, 1.0, sin(la * 1.3 + hash21(fid + 13.0) * 6.2831853) * 0.5 + 0.5);
    float patchF = smoothstep(0.6, 0.2, length(vec2(m, r - (table + 0.3)) * vec2(1.0, 2.5)) + hash21(fid) * 0.2);
    float fireAmt = flashF * (0.4 + 0.6 * patchF) * (0.6 + 1.2 * e) * step(0.5, ring);
    vec3 col = mix(body, fireC * 1.3, clamp(fireAmt, 0.0, 1.0)) + vec3(1.0) * spec * (0.4 + 0.5 * swell);

    // Facet edges: fine bright lines where the facets meet.
    float edgeW = 0.004;
    float edges = 0.0;
    edges += smoothstep(edgeW, 0.0, abs(r - table));
    edges += smoothstep(edgeW, 0.0, abs(r - starEdge)) * step(table, r) * step(r, 0.62);
    edges += smoothstep(edgeW, 0.0, abs(r - kiteEdge)) * step(0.62, r);
    edges += smoothstep(0.006, 0.0, min(af, 1.0 - af) * r) * step(table, r);
    col += vec3(0.9, 0.95, 1.0) * clamp(edges, 0.0, 1.0) * 0.25;

    // Scintillation: tiny sparks on the facet edges, round.
    vec2 sg = p * 70.0; vec2 sc = floor(sg), sf = fract(sg) - 0.5;
    float spark = smoothstep(0.2, 0.0, length(sf)) * step(0.985, hash21(sc + floor(sceneTime * 2.0)));
    col += vec3(1.0) * spark * clamp(edges, 0.0, 1.0) * (0.5 + 2.0 * hi);

    col *= 0.85 + 0.35 * swell;
    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
