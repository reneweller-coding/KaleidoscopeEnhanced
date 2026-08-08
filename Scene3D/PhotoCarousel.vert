#version 120
// PhotoCarousel.vert — the camera stands inside a slowly revolving cylinder
// of 3000 photo cards (50 stacked rings x 60 cards); every card shows its
// own crop of the current image.  Beat waves of tilt travel up the wall,
// onsets shiver the cards.  attrA.xy = card corner, attrA.w = card index.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioBeatPhase;
uniform float audioOnset;
uniform float audioSwell;

varying vec2  vUV;
varying vec4  vSeed;
varying float vGlow;

void main()
{
    float idx  = attrA.w;
    float ring = floor(idx / 60.0);          // 0..49 stacked rings
    float slot = mod(idx, 60.0);             // 0..59 around

    float ang = (slot / 60.0) * 6.2831853
              + time * 0.05 + audioAdvance * 0.12
              + ring * 0.045;                // helical twist
    float y   = (ring - 24.5) * 2.55;
    float R   = 26.0;

    // A tilt wave climbs the wall with the beat; onsets shiver every card.
    float wave = sin(6.2831853 * audioBeatPhase - ring * 0.35);
    float tilt = wave * 0.35 * (0.4 + 0.6 * audioSwell)
               + sin(time * 3.1 + idx) * 0.10 * audioOnset;

    // Card local frame (2.2 x 2.2), facing the centre, tilted around its
    // horizontal axis.
    vec2 corner = (attrA.xy - 0.5) * 2.2;
    vec3 right  = vec3(-sin(ang), 0.0, cos(ang));
    vec3 up     = vec3(0.0, 1.0, 0.0);
    vec3 centre = vec3(cos(ang) * R, y, sin(ang) * R);
    vec3 normal = normalize(vec3(-centre.x, 0.0, -centre.z));

    vec3 world = centre
               + right * corner.x
               + (up * cos(tilt) + normal * sin(tilt)) * corner.y;

    vec3 vp = world;

    // Whole-card cull when the card is behind the camera (all six vertices
    // agree on the centre, so the card vanishes cleanly — no tearing).
    if (centre.z < 1.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vUV = vec2(0.0); vSeed = attrB; vGlow = 0.0;
        return;
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vUV   = attrA.xy;
    vSeed = attrB;
    vGlow = 0.5 + 0.5 * wave;
}
