#version 330 core
out vec4 fragColor;
/**
 * @file UlamPrimeSpiral.frag
 * @brief ULAM PRIME SPIRAL: the integers wound into a square spiral, the
 * primes lit -- and the diagonals they mysteriously favour.  The spiral
 * zooms out steadily on the scene clock (log-periodic, so it never
 * wraps), the primes are round dots coloured by their residue class mod
 * 12 (a chroma class each), the diagonals glow with the bass, the kick
 * lights the newest ring, the photo is the paper.  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> zoom (continuous, periodic)
 *   audioChroma[12] -> prime colour by residue class (light)
 *   audioBass       -> diagonal glow (light)
 *   audioKick       -> outer-ring flash (light)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: zoomP, sizeP, hueP.
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
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float zoomP;
uniform float sizeP;
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

// The integer at square-spiral cell (x, y).
float ulam(vec2 c)
{
    float x = c.x, y = c.y;
    float k = max(abs(x), abs(y));
    float m = (2.0 * k - 1.0) * (2.0 * k - 1.0);         // largest number of the previous ring... (2k-1)^2
    if (k == 0.0) return 1.0;
    if (x == k && y > -k) return m + (y + k);                       // right side, going up
    if (y == k) return m + 2.0 * k + (k - x);                       // top, going left
    if (x == -k) return m + 4.0 * k + (k - y);                      // left, going down
    return m + 6.0 * k + (x + k);                                   // bottom, going right
}

// Primality by trial division (numbers stay below ~1e5 at these zooms).
bool isPrime(float n)
{
    if (n < 2.0) return false;
    if (n < 4.0) return true;
    if (mod(n, 2.0) == 0.0) return false;
    float lim = sqrt(n);
    for (float d = 3.0; d <= 320.0; d += 2.0)
    {
        if (d > lim) break;
        if (mod(n, d) == 0.0) return false;
    }
    return true;
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float rate = 0.08 * (0.7 + 0.6 * clamp(zoomP, 0.0, 1.0));
    // Zoom: cells per unit grows; log-periodic in the cell size doubling
    // is not needed -- the spiral is self-similar enough that a slow
    // continuous zoom out reads as endless.  Cell size shrinks from 1/16
    // toward 1/100 over a long period, then eases back (a slow breath).
    float z = 0.5 + 0.5 * sin(sceneAdvance * rate + sceneTime * 0.01);
    float cells = mix(18.0, 90.0, z) * (0.85 + 0.3 * clamp(sizeP, 0.0, 1.0));
    vec2 g = p * cells;
    vec2 cell = floor(g + 0.5);
    vec2 f = g - cell;                                              // -0.5..0.5 within the cell
    float n = ulam(cell);
    bool prime = isPrime(n);
    float k = max(abs(cell.x), abs(cell.y));

    // Paper: the photo faint, warm.
    vec3 col = img(gl_FragCoord.xy / resolution) * imgPalette(hue * 0.159 + 0.1) * 0.25 + vec3(0.05, 0.045, 0.04);
    // The diagonals glow with the bass (where the primes line up).
    float diag = min(abs(abs(cell.x) - abs(cell.y)), 1.0);
    float diagGlow = (1.0 - diag) * (0.08 + 0.25 * clamp(audioBass, 0.0, 1.0));
    col += imgPalette(hue * 0.159 + 0.6) * diagGlow;
    // The prime: a round dot, coloured by n mod 12 (a chroma class).
    if (prime)
    {
        int cls = int(mod(n, 12.0));
        float e = clamp(audioChroma[cls] * 1.5, 0.0, 1.0);
        vec3 pc = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.6 + 0.2;
        float r = 0.32 + 0.1 * e;
        float d = length(f);
        float dot_ = smoothstep(r, r * 0.6, d);
        col = mix(col, pc * (1.1 + 0.8 * e), dot_);
        col += pc * exp(-d * 4.0) * e * 0.3;
    }
    // Cell grid faint; the outermost visible ring flashes on the kick.
    float grid = smoothstep(0.02, 0.0, 0.5 - max(abs(f.x), abs(f.y)) - 0.0) * 0.05;
    col += vec3(grid);
    float ringK = floor(0.5 * cells) - 1.0;
    col += imgPalette(hue * 0.159 + 0.9) * step(abs(k - ringK), 0.5) * audioKick * 0.5;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
