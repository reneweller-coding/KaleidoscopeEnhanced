#version 330 core
out vec4 fragColor;
// HairCurtain.frag — Kajiya-Kay anisotropic shading.
// -----------------------------------------------------------------------
// A hair is a cylinder far thinner than a pixel, so it has no single normal —
// it has a whole RING of them around the fibre.  Integrating over that ring is
// what Kajiya-Kay does, and the result is that the highlight depends on the
// angle to the TANGENT rather than to a normal.  That is the whole reason hair
// shows a band of light running across the strands instead of a point
// highlight on each one.
//
// The second, offset highlight is the physical one: light that entered the
// fibre, reflected off the far wall and came back out is shifted along the
// strand and tinted by the pigment.  Without it hair looks like nylon.
// -----------------------------------------------------------------------

in vec3  vWorld;
in vec3  vTangent;
in float vAlong;
in float vTint;
in float vKind;

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioHigh;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float camHP;
uniform float sheenP;
uniform float hueP;

vec3 hue2rgb(float h)
{
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// Kajiya-Kay: shift the tangent along the fibre, then take sin of the angle
// between the shifted tangent and the half-vector.
float hairSpec(vec3 T, vec3 H, float shift, float power)
{
    vec3 Ts = normalize(T + shift * vec3(0.0, 1.0, 0.0));
    float d = dot(Ts, H);
    return pow(max(sqrt(1.0 - d * d), 0.0), power);
}

void main()
{
    if (vKind < 0.5)
    {
        // Backdrop: a soft vertical gradient with the slideshow photo far
        // behind, so the gaps between strands read as depth, not as holes.
        vec2 uv = vWorld.xy * 0.5 + 0.5;
        vec3 photo = textureLod(tex0, fract(uv * vec2(0.7, 0.45)
                                            + vec2(time * 0.005, 0.3)), 0.0).rgb;
        photo = mix(vec3(dot(photo, vec3(0.333))), photo, 0.5);
        vec3 col = mix(vec3(0.015, 0.017, 0.028), vec3(0.075, 0.065, 0.095), uv.y);
        col = mix(col, col * 0.8 + photo * 0.14, 0.5);
        col *= 1.0 + 0.3 * audioAmbient;
        fragColor = vec4(col, interpolation);
        return;
    }

    vec3 T = normalize(vTangent);
    vec3 V = normalize(vec3(0.0, camHP, 0.0) - vWorld);
    vec3 L = normalize(vec3(0.42, 0.55, -0.72));
    vec3 H = normalize(L + V);

    // Narrow hue range on purpose: hueP sweeps black through auburn to a warm
    // blond, not around the whole wheel.  Hair that lands on green or cyan
    // stops reading as hair no matter how good the specular is.
    float hue = fract(0.015 + 0.075 * hueP + 0.020 * vTint + 0.03 * sin(audioChromaHue));
    vec3 pigment = mix(vec3(0.030, 0.020, 0.017), hue2rgb(hue), 0.20 + 0.30 * hueP);

    // Diffuse for a fibre is the same ring integral: it goes with sin, not with
    // a clamped dot, so the strands stay lit even when the light is along them.
    float dt = dot(T, L);
    float diffuse = sqrt(max(1.0 - dt * dt, 0.0));

    // Root-to-tip occlusion: deep in the curtain almost nothing gets through.
    float ao = 0.18 + 0.82 * pow(vAlong, 1.3);

    vec3 col = pigment * diffuse * ao * (0.55 + 0.7 * audioAmbient);

    // Primary highlight: shifted toward the root, white.  The exponent is far
    // lower than a solid surface would use — sin() of the fibre angle stays
    // close to 1 over a wide range, so a specular power in the hundreds
    // collapses the band to nothing and the curtain goes dead flat.
    float s1 = hairSpec(T, H, -0.09, 26.0 + 44.0 * sheenP);
    col += vec3(1.0, 0.97, 0.92) * s1 * ao * (0.40 + 1.3 * audioHigh) * (0.3 + 0.6 * sheenP);

    // Secondary highlight: shifted the other way, tinted by the pigment, wider,
    // and glittering because it comes back out at slightly random angles.
    float glint = 0.75 + 0.55 * sin(vTint * 90.0 + vAlong * 26.0 + time * 1.2);
    float s2 = hairSpec(T, H, 0.13, 14.0 + 26.0 * sheenP);
    col += pigment * 1.5 * s2 * glint * ao * (0.4 + 0.9 * audioLevel);

    // A wave of light travelling down the curtain on the kick.
    float band = fract(vAlong * 0.9 - time * 0.22);
    col += hue2rgb(fract(hue + 0.45))
         * pow(max(1.0 - abs(band - 0.5) * 5.0, 0.0), 3.0)
         * ao * (0.35 * audioKick + 0.15 * audioSubBass) * 2.2;

    col *= 1.0 + 0.16 * audioBeat;
    col = col / (1.0 + col * 0.26);
    fragColor = vec4(col, interpolation);
}
