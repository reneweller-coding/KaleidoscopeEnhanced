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

    // The picture ripples along the reaction gradient (a liquid-metal feel).
    vec2 iuv = uv + grad * 4.0;
    vec3 pic = img(fract(iuv));

    // Mood-coloured reaction fronts.
    vec3 cHigh = mix(vec3(1.00, 0.55, 0.25), vec3(0.35, 0.85, 1.00), audioValence);

    // The image is visible EVERYWHERE (never pure black); the reaction field (B)
    // brightens and stains the active regions and the fronts (edges) glow, so the
    // whole picture appears to grow, crawl and dissolve through the pattern.
    float m   = smoothstep(0.04, 0.35, b);
    vec3  col = pic * (0.40 + 1.00 * m);
    col = mix(col, col * cHigh * 1.7, 0.6 * m);            // stain the active regions
    col += edge * (0.35 + 0.80 * audioBeat) * cHigh;       // glowing reaction fronts
    col *= 0.85 + 0.40 * audioCentroid;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
