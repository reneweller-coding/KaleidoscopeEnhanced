// ReactionDiffusion.frag
// -----------------------------------------------------------------------
// The living Gray-Scott reaction-diffusion field (simulated on the GPU into
// "texSim") is used as a LENS on the source image: the B-concentration reveals
// the picture where the reaction is active and pushes it around along the
// field's gradient, so the image seems to grow, crawl and dissolve through the
// organic pattern.  Glowing edges trace the reaction fronts, coloured by mood.
// The *image* is the star (was a faint 25% tint on procedural colour).  If the
// simulation is unavailable, texSim reads 0 and it degrades to a dark field.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSim;      // reaction-diffusion state (R=A, G=B)
uniform float interpolation;

uniform float audioValence;
uniform float audioCentroid;
uniform float audioBeat;
uniform float audioPhase;

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    // Gentle drift so the fixed-grid simulation feels alive on screen.
    vec2 suv = uv + 0.02 * vec2(sin(uv.y * 6.0 + audioPhase * 0.3),
                                cos(uv.x * 6.0 + audioPhase * 0.3));
    vec2 px = 1.0 / resolution;

    float b = texture2D(texSim, suv).g;

    // Field gradient (reaction fronts) -> edge glow + image displacement.
    float bx = texture2D(texSim, suv + vec2(px.x, 0.0)).g
             - texture2D(texSim, suv - vec2(px.x, 0.0)).g;
    float by = texture2D(texSim, suv + vec2(0.0, px.y)).g
             - texture2D(texSim, suv - vec2(0.0, px.y)).g;
    vec2  grad = vec2(bx, by);
    float edge = clamp(length(grad) * 6.0, 0.0, 1.0);

    // The picture, dragged along the reaction gradient and revealed by B.
    vec2 iuv = uv + grad * 6.0;
    vec3 pic = img(fract(iuv));

    // Mood-coloured fronts.
    vec3 cLow  = mix(vec3(0.02, 0.04, 0.12), vec3(0.10, 0.02, 0.14), audioCentroid);
    vec3 cHigh = mix(vec3(0.90, 0.45, 0.20), vec3(0.30, 0.90, 1.00), audioValence);

    // Inactive regions keep a dim image (mood-tinted) so it never goes black;
    // active reaction regions reveal the picture at full strength.
    vec3  base   = mix(cLow, img(uv) * 0.30, 0.6);
    float reveal = smoothstep(0.10, 0.50, b);
    vec3  col = mix(base, pic * (1.3 + 0.6 * audioCentroid), reveal);
    col += edge * (0.40 + 0.80 * audioBeat) * cHigh;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
