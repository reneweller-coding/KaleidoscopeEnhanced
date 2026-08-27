#version 330 core
out vec4 fragColor;

/**
 * @file Assembly.frag
 * @brief Pieces flying in from nowhere and settling into an object that was not
 * there a moment ago (the flight itself is in the geometry stage). A piece
 * still in the air is hot and half-transparent; a seated one is cold, solid and
 * lit. The transition between those two states is what the eye follows.
 *
 * A shatter can be watched passively -- it is over in a second and the eye just
 * catches the debris. An assembly has to be READ, because for most of its
 * length the object is an ambiguous cloud, and every arriving piece narrows
 * down what it will turn out to be. Keeping unseated pieces hot and vague is
 * what protects that ambiguity; drawing them fully lit from the start would
 * give the answer away in the first frame.
 *
 *   sceneProgress -> the arrival (geometry stage)
 *   audioKick     -> seated pieces jolt; arrivals flare
 *   audioSwell    -> heat on the pieces still in flight
 *
 * Per-instance: sizeP, chunkP (grid density), spreadP (how far out they start),
 *               tintP (heat hue).
 * Per-activation variety: hueP float palette offset (0..6.28).
 */

uniform sampler2DArray texMeshMaterial;
uniform int texMeshMaterialLayers;

uniform float time;
uniform float audioKick;
uniform float audioSwell;
uniform float audioAdvance;
uniform float sceneProgress;

uniform float hueP;
uniform float tintP;

in vec2  vUV;
in vec3  vNormal;
in vec3  vPos;
in float vBg;
in float vSeat;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float starsField(vec3 dir, float density)
{
    vec3 g = floor(dir * 200.0);
    float h = hash11(dot(g, vec3(1.0, 57.0, 113.0)));
    return step(1.0 - density, h) * (0.35 + 0.65 * hash11(h * 31.7));
}

// A 4x4 ordered dither: the pieces in flight are made see-through by DISCARDING
// fragments rather than by blending, because discarded fragments write no depth
// and the result stays correct whatever order the chunks happen to be drawn in.
float bayer4(vec2 p)
{
    int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
    int i = y * 4 + x;
    float m[16] = float[16](0.0, 8.0, 2.0,10.0, 12.0, 4.0,14.0, 6.0,
                            3.0,11.0, 1.0, 9.0, 15.0, 7.0,13.0, 5.0);
    return (m[i] + 0.5) / 16.0;
}

float materialExposure(sampler2DArray tex)
{
    vec3 avg = textureLod(tex, vec3(0.5, 0.5, 0.0), 20.0).rgb;
    float l = dot(avg, vec3(0.299, 0.587, 0.114));
    return clamp(0.20 / max(l, 0.02), 0.30, 2.0);
}

// An empty volume with a far light: the pieces have to arrive FROM somewhere,
// and a busy backdrop would hide them on the way in.
vec3 renderSky(vec3 dir, vec3 tint)
{
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(vec3(0.014, 0.015, 0.022), vec3(0.030, 0.028, 0.040), h);
    float d = max(dot(dir, normalize(vec3(-0.4, 0.5, 0.76))), 0.0);
    col += tint * pow(d, 40.0) * 0.55;
    col += vec3(1.0) * starsField(dir, 0.0016);
    return col;
}

void main()
{
    float hue = (hueP > 0.01 ? hueP : 0.0);
    vec3 tint = hueRot(vec3(1.0, 0.52, 0.20), tintP);

    if( vBg > 0.5 )
    {
        fragColor = vec4(renderSky(normalize(vPos), tint), 1.0);
        return;
    }

    float seat = clamp(vSeat, 0.0, 1.0);

    // In flight: thinned out by the dither, so the cloud reads as a swarm with
    // depth rather than as a solid mass of debris.
    float solidity = 0.30 + 0.70 * seat;
    if( solidity < bayer4(gl_FragCoord.xy) ) discard;

    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(-vPos);

    vec3 base = vec3(0.5);
    if( texMeshMaterialLayers > 0 )
        base = texture(texMeshMaterial, vec3(vUV, 0.0)).rgb * materialExposure(texMeshMaterial);

    float lam = max(dot(n, normalize(vec3(-0.4, 0.72, -0.55))), 0.0);
    vec3 col = base * (0.22 + 1.15 * lam) * (0.45 + 0.55 * seat);

    // Heat, strongest just before a piece lands: it fades as the piece seats,
    // so the arrival has a visible last moment instead of simply stopping.
    float heat = (1.0 - seat) * (0.55 + 0.9 * audioSwell);
    col += tint * heat * (0.8 + 1.4 * pow(seat, 2.0));

    // The flare AT the moment of seating -- a narrow window around seat = 1.
    float landing = smoothstep(0.82, 1.0, seat) * (1.0 - smoothstep(1.0, 1.02, seat));
    col += tint * landing * (1.2 + 2.2 * audioKick);

    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    col += tint * rim * (0.22 + 0.45 * audioSwell) * seat;

    if( hue > 0.001 ) col = hueRot(col, 0.12 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
