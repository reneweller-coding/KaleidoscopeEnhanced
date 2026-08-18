#version 330 core
out vec4 fragColor;
// KelpForest.frag — soft blade: bright midrib, translucent edges.
in vec4  vCol;
in float vSide;

/**
 * @file KelpForest.frag
 * @brief Shades one kelp-blade ribbon of an underwater forest: a soft
 * translucent body with a brighter midrib line down the centre.
 *
 * All colour and motion (the surge sway, tip taper, caustic tinting, and
 * audio response) are computed upstream in KelpForest.vert and arrive
 * baked into vCol; this stage only shapes the cross-blade falloff from
 * vSide into a body-plus-midrib glow.
 */

void main()
{
    float d    = abs(vSide);
    float body = exp(-d * d * 2.2);
    float rib  = exp(-d * d * 30.0) * 0.5;
    fragColor = vec4(vCol.rgb * (body + rib), 1.0);
}
