#version 330 core
out vec4 fragColor;
/**
 * @file SeifertSurfaceBraidKnot.frag
 * @brief SEIFERT SURFACE BRAID KNOT: 3D orientable minimal surface bounded by a complex
 * (3,5) torus braid knot. Interlocking mathematical ribbons, normal sheen, edge glints,
 * and photo texturing flowing along topological geodesics.
 *   audioAdvance -> navigates ribbon trajectory through torus knot loops
 *   audioKick    -> flashes ribbon edge specular reflection glints
 *   audioSwell   -> widens Seifert ribbon width & subsurface translucency
 *   audioCentroid-> shifts knot surface palette spectra
 *
 * Per-activation variety:
 *   knotP        float braid knot winding frequency         (0.6..2.0)
 *   ribbonWidthP float ribbon band thickness                (0.03..0.12)
 *   sheenP       float specular normal sheen brightness     (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in vec3 vNormal;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float sheenP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float edge = exp(-abs(abs(vSide) - 0.92) * 16.0);
    float core = pow(1.0 - abs(vSide), 2.0);

    vec3 lightDir = normalize(vec3(0.4, 0.6, 0.8));
    float diff = max(0.0, abs(dot(vNormal, lightDir)));
    float spec = pow(max(0.0, abs(dot(vNormal, vec3(0.0, 0.0, 1.0)))), 18.0) * (sheenP > 0.01 ? sheenP : 1.2);

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.5 + 0.5 * diff);
    col += vCol * core * (0.8 + 0.4 * audioSwell);
    col += vec3(0.9, 0.95, 1.0) * edge * (1.0 + 3.0 * audioKick);
    col += vec3(1.0, 0.9, 0.8) * spec;
    col += vCol * (audioKick * 0.3);

    // additive pass dim: this geom renders GL_ONE/GL_ONE without
    // depth -- overlapping layers ADD, so each fragment must stay
    // well below 1.0 or the stack burns to white.
    col *= 0.15;

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    float _ssLum = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(mix(vec3(_ssLum), col, 1.9) * 1.25, 0.0, 1.0);   // measured sat 0.03
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
