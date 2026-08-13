#version 330 core
out vec4 fragColor;
// StainedGlassRosette.frag — a 12-petal kaleidoscope of Voronoi "glass"
// pieces, each a saturated, hue-varied crop of the current image, held
// together by dark lead lines; warm godrays radiate from behind, pulsing
// with the swell and flaring on the kick.
uniform sampler2D tex0;
uniform float time;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioDrop;
uniform float audioChromaHue;

in vec2  vPolar;      // angle, radius 0..1
in vec2  vXY;

float hashG(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2  hash2G(vec2 p)
{
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                          dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// Classic 2D Voronoi: returns (cellHash, edgeDist F2-F1).
vec3 voronoi(vec2 p)
{
    vec2 ip = floor(p), fp = fract(p);
    float f1 = 8.0, f2 = 8.0;
    vec2  bestOff = vec2(0.0);
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++)
    {
        vec2 off = vec2(float(x), float(y));
        vec2 pt  = off + hash2G(ip + off) - fp;
        float d  = dot(pt, pt);
        if (d < f1) { f2 = f1; f1 = d; bestOff = ip + off; }
        else if (d < f2) { f2 = d; }
    }
    return vec3(hashG(bestOff), f1, f2);
}
vec3 hueRotG(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float ang = vPolar.x + time * 0.02;
    float rad = vPolar.y;

    // 12-fold mirror symmetry — a rose window's repeating petals.
    const float N = 12.0;
    float sector = 6.2831853 / N;
    float fa = abs(mod(ang, sector * 2.0) - sector);

    vec2 pv = vec2(cos(fa), sin(fa)) * rad * 9.0;
    vec3 vc = voronoi(pv);
    float cellHash = vc.x;
    float lead = smoothstep(0.0, 0.015, vc.z - vc.y);   // dark border near edges

    // Each glass piece: a seeded crop of the current image, saturated.
    vec2 crop = hash2G(vec2(cellHash * 37.0, cellHash * 71.0)) * 0.6;
    vec2 sampleUV = crop + fract(pv * 0.15 + cellHash * 3.0) * 0.4;
    vec3 pic = texture(tex0, sampleUV).rgb;
    float lum = dot(pic, vec3(0.299, 0.587, 0.114));
    vec3 glass = mix(vec3(lum), pic, 1.7);              // extra saturation
    glass = hueRotG(glass, audioChromaHue * 0.5 + cellHash * 2.2);

    vec3 col = mix(vec3(0.03, 0.02, 0.02), glass, lead);

    // Godrays radiating from behind the window; pulse with the swell.
    float rays = pow(0.5 + 0.5 * sin(ang * 16.0 + audioAdvance * 0.6), 10.0);
    col += hueRotG(vec3(1.0, 0.75, 0.40), audioChromaHue * 0.3)
         * rays * (0.35 + 0.6 * audioSwell + 0.9 * audioKick) * (1.0 - rad);

    // Backlight breathing through the whole window + drop flare.
    col *= (0.75 + 0.35 * audioSwell + 0.6 * audioDrop);

    // Soft circular vignette so the disc has a clean rim.
    col *= smoothstep(1.05, 0.85, rad);

    fragColor = vec4(col * 1.3, 1.0);
}
