#version 330 core
out vec4 fragColor;
/**
 * @file Physarum.frag
 * @brief The living Physarum (slime mould) vein network, simulated on the GPU
 * (see `Engine/PhysarumAgents`/`PhysarumDeposit`/`PhysarumDiffuse`) and exposed on "texPhysarum":
 * 65k agents lay and follow pheromone trails, so glowing veins grow, merge
 * and constantly rebuild — one of the most organic images a computer can
 * make.  Two species live in R and G; here they get warm/cool hues around
 * the musical key, the veins are lit like embossed relief, and the picture
 * is stained through the strongest lanes.  Kicks scatter the swarm in the
 * SIM (the network visibly explodes and re-forms).
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texPhysarum;   // trail map (R/G = species pheromone)
uniform float interpolation;

uniform float audioBeat;
uniform float audioOnset;
uniform float audioPhase;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioLevel;

// Per-activation variety:
uniform int   sidesP;            // kaleido fold (0/1 off; 2..8)
uniform float zoomP;             // field zoom (0 -> 1.0; 0.7..1.6)

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float zoomV = (zoomP <= 0.01) ? 1.0 : zoomP;

    vec2 suv;
    if (sidesP >= 2)
    {
        vec2 cp = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
        cp = rot(time * 0.012 + audioPhase * 0.04) * cp;
        suv = kaleido(cp, float(sidesP)) * 0.8 * zoomV + 0.5;
    }
    else
        suv = (uv - 0.5) * zoomV + 0.5
            + 0.015 * vec2(sin(uv.y * 5.0 + audioPhase * 0.2),
                           cos(uv.x * 5.0 + audioPhase * 0.2));

    vec2 tr = texture(texPhysarum, suv).rg;

    // Relief lighting from the trail gradient (embossed living veins).
    vec2 px = vec2(2.0 / 512.0);
    float hC = tr.r + tr.g;
    float hX = texture(texPhysarum, suv + vec2(px.x, 0.0)).r
             + texture(texPhysarum, suv + vec2(px.x, 0.0)).g - hC;
    float hY = texture(texPhysarum, suv + vec2(0.0, px.y)).r
             + texture(texPhysarum, suv + vec2(0.0, px.y)).g - hC;
    vec3 n    = normalize(vec3(-hX * 8.0, -hY * 8.0, 1.0));
    float diff = max(dot(n, normalize(vec3(0.4, 0.5, 0.8))), 0.0);

    // Two species: warm and cool hues around the musical key.
    vec3 vA = hueRot(vec3(1.0, 0.45, 0.12), audioChromaHue);
    vec3 vB = hueRot(vec3(0.15, 0.55, 1.0), audioChromaHue);
    vec3 veins = vA * smoothstep(0.04, 0.8, tr.r)
               + vB * smoothstep(0.04, 0.8, tr.g);
    veins *= 0.55 + 0.65 * diff;

    // The picture shines through the strongest lanes.
    float lane = smoothstep(0.25, 1.1, hC);
    vec3 pic = img(fract(suv + vec2(0.0, 0.02 * sin(audioPhase * 0.1))));
    vec3 col = pic * (0.10 + 0.65 * lane);
    col += veins * (0.9 + 0.5 * audioSwell + 0.35 * audioBeat);
    col += vec3(1.0, 0.95, 0.85) * pow(hC * 0.6, 3.0) * 0.35;   // hot cores

    col *= 1.0 + 0.15 * audioOnset + 0.8 * audioDrop;
    col *= 0.9 + 0.3 * audioLevel;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
