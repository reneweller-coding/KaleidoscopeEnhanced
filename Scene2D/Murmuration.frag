#version 330 core
out vec4 fragColor;
// Murmuration.frag — 131k boids with a real spatial-hash neighbourhood.
// A starling flock reads as DENSITY, not as individuals, so this pass leans
// on contrast shaping: dense regions go dark and solid, thin regions glow.

uniform sampler2D tex0;
uniform sampler2D texBoids;      // <- requests the flocking sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioDrop;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float inkP;              // preset: how "ink-like" the dense parts get
uniform float glowP;

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 flock = texture(texBoids, uv).rgb;

    // A TIGHT blur only: the whole point of 131k individually simulated birds
    // is the fine density texture, and a wide halo erases exactly that.
    vec3 blur = vec3(0.0);
    float r = 0.0018 + 0.0022 * glowP;
    for (int i = 0; i < 8; ++i)
    {
        float t = float(i) * 0.7854;
        blur += texture(texBoids, uv + vec2(cos(t), sin(t)) * r).rgb;
    }
    blur /= 8.0;

    float dens = clamp(dot(flock + blur * 0.6, vec3(0.55)), 0.0, 1.0);
    dens = pow(dens, 0.80);          // lift the thin edges of the flock

    // SKY, not photo.  Compositing 131k fine specks over a busy photograph
    // turned both into mush — the flock only becomes readable against a clean
    // gradient.  Two widely spaced taps give the photo's palette, a vertical
    // ramp between them gives the evening sky, and a low sun anchors it.
    vec3 pa = texture(tex0, vec2(0.25, 0.80)).rgb;
    vec3 pb = texture(tex0, vec2(0.75, 0.20)).rgb;
    float la = dot(pa, vec3(0.299, 0.587, 0.114));
    float lb = dot(pb, vec3(0.299, 0.587, 0.114));
    vec3 hi = mix(vec3(la), pa, 0.45) * 1.70 + 0.20;   // zenith
    vec3 lo = mix(vec3(lb), pb, 0.55) * 1.15 + 0.10;   // horizon
    vec3 skyCol = mix(lo, hi, pow(uv.y, 0.75));

    // Low sun: a broad warm glow near the horizon, pulsing with the level.
    vec2 sun = vec2(0.5 + 0.22 * sin(time * 0.02), 0.18);
    float sd = length((uv - sun) * vec2(resolution.x / resolution.y, 1.0));
    skyCol += vec3(1.10, 0.72, 0.42) * exp(-sd * 3.2)
              * (0.30 + 0.25 * audioLevel + 0.20 * audioBeat);
    skyCol *= 0.75 + 0.35 * audioAmbient;

    // The flock darkens the sky where it is dense (real starlings are
    // silhouettes); the shimmer is only a rim highlight on the beat, never
    // the main event — otherwise the birds read as glowing gas.
    vec3 ink = skyCol * (1.0 - dens * (0.70 + 0.30 * inkP));
    vec3 shimmer = (flock + blur * 0.4) * (0.035 + 0.11 * audioBeat);

    vec3 col = ink + shimmer * dens;

    // A drop makes the collapsing flock flare briefly.
    col += shimmer * audioDrop * 0.8;
    col *= 1.0 + 0.15 * audioKick;

    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
