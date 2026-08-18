#version 330 core
out vec4 fragColor;
/**
 * @file PhysarumDiffuse.frag
 * @brief Trail-map relaxation: 3x3 mean blur (pheromone diffusion) x decay
 * (evaporation).  The balance of deposit vs. evaporation sets how bold
 * the vein network grows; decay is audio-nudged host-side.
 */

uniform sampler2D texTrail;
uniform vec2  resolution;      // trail-map size
uniform float decay;

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 px = 1.0 / resolution;

    vec2 sum = vec2(0.0);
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x)
            sum += texture(texTrail, fract(uv + vec2(float(x), float(y)) * px)).rg;
    sum /= 9.0;

    fragColor = vec4(sum * decay, 0.0, 1.0);
}
