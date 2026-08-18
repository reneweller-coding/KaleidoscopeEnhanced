#version 330 core
out vec4 fragColor;
/**
 * @file PhysarumAgents.frag
 * @brief Physarum polycephalum (slime mould) agent update — the classic Jones
 * (2010) model on the GPU: each texel of the 256x256 agent texture IS one
 * agent (R = x, G = y in trail-map space, B = heading, A = species).  The
 * agent samples the trail map at three sensor points (ahead, left, right),
 * turns toward the strongest pheromone OF ITS OWN SPECIES, moves, and
 * wraps toroidally.  Together with the deposit + diffuse passes this
 * grows the signature living vein networks that constantly rebuild.
 *
 * Audio (from FilterShader::stepPhysarum): sensor angle follows the
 * spectral centroid (bright -> tighter, more directed veins), speed rides
 * the level/kick, and a strong kick SCATTERS a fraction of the agents
 * (random new heading) so the net visibly explodes and re-forms.
 */

uniform sampler2D texAgents;   // previous agent state
uniform sampler2D texTrail;    // trail map (R = species A, G = species B)
uniform vec2  resolution;      // agent texture size
uniform float seedMode;        // 1 on the first frame -> random init
uniform float time;
uniform float speed;           // move step per frame (trail-map uv units)
uniform float sensAngle;       // sensor half-angle (radians)
uniform float sensDist;        // sensor distance (trail-map uv units)
uniform float turnRate;        // turn per frame (radians)
uniform float scatter;         // 0..1 fraction of agents re-randomised now

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

float senseOwn(vec2 pos, float species)
{
    vec2 t = texture(texTrail, fract(pos)).rg;
    return mix(t.r, t.g, species);
}

void main()
{
    vec2 texel = gl_FragCoord.xy / resolution;

    if (seedMode > 0.5)
    {
        // Random position + heading; species by texel parity-ish hash.
        vec2  p = vec2(hash21(texel * 17.1), hash21(texel * 29.7 + 3.3));
        float a = hash21(texel * 41.3 + 7.7) * 6.2831853;
        float s = step(0.5, hash21(texel * 53.9 + 1.2));
        fragColor = vec4(p, a, s);
        return;
    }

    vec4  ag  = texture(texAgents, texel);
    vec2  pos = ag.rg;
    float ang = ag.b;
    float spc = ag.a;

    // Three-sensor steering toward the strongest own-species trail.
    vec2 dF = vec2(cos(ang),             sin(ang));
    vec2 dL = vec2(cos(ang + sensAngle), sin(ang + sensAngle));
    vec2 dR = vec2(cos(ang - sensAngle), sin(ang - sensAngle));
    float f = senseOwn(pos + dF * sensDist, spc);
    float l = senseOwn(pos + dL * sensDist, spc);
    float r = senseOwn(pos + dR * sensDist, spc);

    if (f >= l && f >= r)
        ;                                        // keep going
    else if (l > r) ang += turnRate;
    else if (r > l) ang -= turnRate;
    else            ang += (hash21(texel + fract(time)) - 0.5) * 2.0 * turnRate;

    // Small persistent wander so lanes stay organic.
    ang += (hash21(texel * 3.7 + fract(time * 0.7)) - 0.5) * 0.15;

    // Kick scatter: a fraction of agents forgets its heading NOW.
    if (scatter > 0.001 && hash21(texel * 9.1 + floor(time * 11.0)) < scatter)
        ang = hash21(texel * 13.7 + fract(time)) * 6.2831853;

    pos = fract(pos + vec2(cos(ang), sin(ang)) * speed);

    fragColor = vec4(pos, ang, spc);
}
