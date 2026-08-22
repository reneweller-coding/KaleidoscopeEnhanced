#version 330 core
out vec4 fragColor;
/**
 * @file DendriticSnowflakeIceCrystalHabit.frag
 * @brief DENDRITIC SNOWFLAKE ICE CRYSTAL HABIT: Hexagonal 6-fold dendritic snowflake growth
 * (stellar dendrite / fernlike crystal habit). Non-linear diffusion-limited aggregation,
 * faceted ice prism specular highlights, prismatic refraction, and cryogenic photo texturing.
 *   audioAdvance -> navigates supersaturated ice vapor diffusion & branch growth
 *   audioKick    -> flashes ice crystal facet specular glints & diamond sparkles
 *   audioSwell   -> widens hexagonal dendritic branch width & ice crystal transparency
 *   audioCentroid-> shifts ice birefringence / cryogenic dispersion spectra
 *
 * Per-activation variety:
 *   flakeScaleP float snowflake 3D scale                  (0.8..2.2)
 *   specularP   float hexagonal facet specular shine gain (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vIceGlow;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float specularP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

in float vGrow;

void main()
{
    // Carve an actual six-fold dendrite out of the quad.  The old body drew
    // abs(sin(31x)) stripe bars edge to edge -- pure zebra, no snowflake.
    vec2 p = vUV * 2.0 - 1.0;
    float r = length(p);
    float th = atan(p.y, p.x);
    float a = mod(th + 0.5235988, 1.0471976) - 0.5235988;
    vec2 q = vec2(cos(a), abs(sin(a))) * r;

    float grow = clamp(vGrow, 0.2, 1.0);
    float armLen = 0.92 * grow;

    // Main arm, tapering to the tip.
    float wArm = 0.075 * (1.0 - q.x / max(armLen, 1e-3) * 0.8);
    float dArm = max(q.y - max(wArm, 0.004), q.x - armLen);

    // Side branches every 0.15 along the arm, sweeping back at 60 degrees.
    float cell = 0.15;
    float ci = floor(q.x / cell);
    float bx = q.x - (ci + 0.5) * cell;
    vec2 bq = vec2(bx, q.y);
    vec2 bd = vec2(0.5, 0.8660254);
    float along = clamp(dot(bq, bd), 0.0, 1.0);
    float bLen = 0.34 * clamp(1.15 - q.x * 1.05, 0.0, 1.0) * grow;
    along = min(along, bLen);
    float dBr = length(bq - bd * along) - 0.022;
    if (q.x < 0.08 || q.x > armLen) dBr = 1e3;

    // Hexagonal centre plate.
    float dPlate = r - 0.15 * grow;

    float dFlake = min(min(dArm, dBr), dPlate);
    float alpha = 1.0 - smoothstep(-0.004, 0.014, dFlake);
    if (alpha < 0.02) discard;

    vec3 lightDir = normalize(vec3(0.5, 0.6, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 0.0, 1.0))), 24.0)
               * (specularP > 0.01 ? specularP : 1.2);

    // Pale ice over the photo-arc palette.
    vec3 ice = mix(vec3(0.82, 0.92, 1.0), vCol, 0.45);
    vec3 col = ice * (0.55 + 0.55 * diff);
    col += vec3(0.95, 0.97, 1.0) * spec * (0.8 + 2.2 * audioKick);

    // Branch and arm tips sparkle.
    float tip  = smoothstep(bLen * 0.75, bLen, along) * step(dBr, 0.01);
    float tipA = smoothstep(armLen * 0.85, armLen, q.x) * step(dArm, 0.01);
    col += vec3(0.9, 0.97, 1.0) * (tip + tipA) * (0.8 + 2.5 * audioKick);

    col *= (0.9 + 0.3 * audioSwell);
    col /= 1.0 + 0.30 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}
