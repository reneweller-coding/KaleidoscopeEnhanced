#version 330 core
out vec4 fragColor;
// Ocean.frag — water shading for the tessellated surface.
// Fresnel decides the mix: looking down you see into the water, looking
// toward the horizon it turns into a mirror.  That single term is what makes
// a water shader read as water rather than as blue plastic.

in vec3  vWorld;
in vec2  vSurfUV;
in float vFoam;
in vec3  vNormal;
in float vDist;

uniform sampler2D tex0;      // the slideshow photo = the sky this sea reflects
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float camHP;
uniform float foamP;
uniform float glitterP;

void main()
{
    vec3 n = normalize(vNormal);
    vec3 V = normalize(vec3(0.0, camHP, 0.0) - vWorld);

    // Sun low over the horizon — that is where the glitter path comes from.
    vec3 L = normalize(vec3(0.35 * sin(time * 0.03), 0.22, 1.0));

    // Capped below 1: at full reflectance the water loses its own colour
    // entirely at grazing angles and reads as sheet metal.
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
    fres = mix(0.02, 0.72, fres);

    // Sky reflection: the photo, sampled along the reflected ray.  Deliberately
    // low-contrast so the sea keeps its own colour.
    vec3 R = reflect(-V, n);
    vec2 skyUV = vec2(atan(R.x, R.z) / 6.2831853 + 0.5,
                      clamp(R.y, 0.0, 1.0));
    vec3 sky = texture(tex0, fract(skyUV)).rgb;
    sky = mix(vec3(dot(sky, vec3(0.33))), sky, 0.55) * 0.75 + 0.03;

    // Water body colour: deep teal, shallower and greener on the crests.
    vec3 deep    = vec3(0.010, 0.055, 0.105);
    vec3 shallow = vec3(0.03, 0.34, 0.42);
    float lift = clamp(vWorld.y * 0.35 + 0.5, 0.0, 1.0);
    vec3 body; body = mix(deep, shallow, lift) * (1.15 + 0.5 * audioAmbient);

    vec3 col = mix(body, sky, fres);

    // Specular sun glitter — the treble sharpens it into sparkles.
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(n, H), 0.0), 120.0 + 420.0 * glitterP);
    col += vec3(1.1, 1.0, 0.9) * spec * (1.4 + 3.0 * audioHigh);

    // Foam on the breaking crests.
    float foam = vFoam * (0.5 + 0.9 * foamP) * (1.0 + 0.7 * audioKick);
    col = mix(col, vec3(0.92, 0.96, 1.0), clamp(foam, 0.0, 0.9));

    // Subsurface glow in the wave backs, pumped by the sub-bass swell.
    col += shallow * max(vWorld.y, 0.0) * 0.09 * (1.0 + 1.6 * audioSubBass);

    // Bounded hue nudge so a full-turn chromaHue cannot turn the sea purple.
    float hr = 0.10 * sin(audioChromaHue);
    col.rb = mat2(cos(hr), -sin(hr), sin(hr), cos(hr)) * col.rb;

    // Distance haze toward the horizon.
    float haze = clamp(vDist / 220.0, 0.0, 1.0);
    vec3 hazeCol = sky * 0.55 + vec3(0.04, 0.06, 0.09);
    col = mix(col, hazeCol, haze * haze * 0.85);

    col *= 1.0 + 0.18 * audioBeat;
    col = col / (1.0 + col * 0.30);
    fragColor = vec4(col, interpolation);
}
