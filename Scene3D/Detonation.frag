#version 330 core
out vec4 fragColor;
// Detonation.frag — cold shell outside, molten core inside.
// Once a shard lifts away, the camera starts seeing the INSIDE of the shell on
// the far side of the ball, and those fragments are shaded as glowing magma.
// The gaps therefore look like they open onto something rather than onto empty
// space.
//
// Which side we are on is decided by the normal, NOT by gl_FrontFacing: that
// flag follows the mesh's triangle winding, and the grid this sphere is built
// from winds inward, so it reports the whole outer shell as back-facing and
// paints the entire ball as magma.  The geometry shader already orients each
// shard's normal outward, so the sign of dot(N, V) is the honest test.

in vec3  vNormal;
in vec3  vView;
in vec3  vWorld;
in float vShard;
in float vEdge;
in vec2  vUV;

uniform sampler2D tex0;
// Declaring this is what asks the engine for the extra depth pass.
uniform sampler2DShadow texShadow;
uniform mat4  lightM;
uniform vec3  lightDir;
uniform float shadowPass;
uniform float shadowTexel;
uniform float shadowExtent;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float blastP;

// Same normal-offset lookup as PillarHall; the offset is in world units, so it
// follows this scene's much smaller shadow box automatically.
float shadowAt(vec3 world, vec3 n, float ndl)
{
    float lift = (2.0 * shadowExtent * shadowTexel) * 2.2 / max(ndl, 0.15);
    vec4 lp = lightM * vec4(world + n * lift, 1.0);
    vec3 proj = lp.xyz / lp.w * 0.5 + 0.5;
    if (proj.z > 1.0)
        return 1.0;
    float bias = 0.0006 + 0.0030 * (1.0 - ndl);
    float s = 0.0;
    float r = shadowTexel * 1.6;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x)
            s += texture(texShadow,
                         vec3(proj.xy + vec2(float(x), float(y)) * r, proj.z - bias));
    return s / 9.0;
}

void main()
{
    // Depth pass: nothing to shade, and sampling texShadow here would read the
    // texture currently being rendered into.
    if (shadowPass > 0.5)
    {
        fragColor = vec4(0.0);
        return;
    }

    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    vec3 L = normalize(lightDir);

    vec3 col;

    if (dot(n, V) > 0.0)
    {
        // --- outer shell: dark, mineral, with the photo as its environment ---
        float diff = max(dot(n, L), 0.0);
        float wrap = 0.5 + 0.5 * dot(n, L);

        // Shards now cast onto each other: a plate lifting off the shell throws
        // its shadow across the ones still in place, which is what finally
        // makes the surface read as a solid crust rather than as a mosaic.
        float shadow = shadowAt(vWorld, n, diff);

        vec3 rock = mix(vec3(0.16, 0.17, 0.21), vec3(0.36, 0.31, 0.27), vEdge);
        col = rock * (0.30 + 0.95 * diff * shadow + 0.55 * wrap * wrap);

        // Cool counter-light, so the shards facing away are still solid objects
        // and not black holes with glowing edges.
        col += rock * vec3(0.45, 0.58, 0.95)
             * max(dot(n, normalize(vec3(-0.6, -0.3, -0.7))), 0.0) * 0.55;

        vec3 R = reflect(-V, n);
        vec2 envUV = vec2(atan(R.x, R.z) / 6.2831853 + 0.5,
                          clamp(R.y * 0.5 + 0.5, 0.0, 1.0));
        vec3 env = textureLod(tex0, fract(envUV), 0.0).rgb;
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        col = mix(col, env * 0.55, fres * 0.45);

        vec3 H = normalize(L + V);
        col += vec3(0.9, 0.92, 1.0) * pow(max(dot(n, H), 0.0), 70.0)
             * shadow * (0.6 + 1.8 * audioHigh);

        // A shard that has flown glows along its underside — the heat it took
        // with it.  This is what ties the flying pieces to the core.
        // Only the shards that really travelled carry heat.  A gentle exponent
        // here lights every plate at rest and the shell turns into a disco
        // ball; the steep one keeps the glow as a signal that something moved.
        vec3 hot = mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.78, 0.25), vEdge);
        col += hot * pow(vShard, 3.0) * (0.25 + 0.7 * glowP)
             * (0.5 + 0.9 * audioKick);
    }
    else
    {
        // --- inside: molten, seen through the gaps the shards left behind ---
        float band = 0.5 + 0.5 * sin(vUV.y * 42.0 + time * 0.6 + vUV.x * 9.0);
        vec3 magma = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.85, 0.35),
                         band * (0.35 + 0.5 * audioLevel));
        col = magma * (0.35 + 0.8 * glowP) * (0.4 + 1.0 * audioSubBass);

        // A shard's own back face only glows once it has actually flown; at
        // rest the inside of the shell is cooling crust, and lighting all of it
        // would leave the ball orange even while it is closed.
        col *= 0.30 + 1.1 * vShard;

        // Darken toward grazing angles so the core still has a shape.
        col *= 0.45 + 0.55 * abs(dot(n, V));
        col += vec3(1.0, 0.55, 0.15) * audioKick * vShard * 0.8;
    }

    // Bounded hue nudge — the fire has to stay fire.
    float hr = 0.08 * sin(audioChromaHue);
    col.rb = mat2(cos(hr), -sin(hr), sin(hr), cos(hr)) * col.rb;

    col *= 1.0 + 0.22 * audioBeat + 0.20 * audioAmbient;
    col = col / (1.0 + col * 0.26);
    fragColor = vec4(col, interpolation);
}
