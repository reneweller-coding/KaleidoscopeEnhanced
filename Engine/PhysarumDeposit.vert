#version 330 core
// PhysarumDeposit.vert — one point per agent: fetch the agent's position
// from the state texture (vertex texture fetch — texture2D is legal in a
// GL2 vertex shader and every GL3+ GPU supports it) and place a 1px point
// there in the trail map.  Species rides to the fragment stage so the two
// populations deposit into separate channels.

in vec2 aTexel;           // this agent's texel coordinate (0..1)

uniform sampler2D texAgents;

out float vSpecies;

void main()
{
    vec4 ag = texture(texAgents, aTexel);
    vSpecies = ag.a;
    // Trail-map uv (0..1) -> clip space (-1..1).
    gl_Position = vec4(ag.rg * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}
