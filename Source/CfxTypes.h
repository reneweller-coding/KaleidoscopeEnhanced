// CfxTypes.h — the compute-FX sim identities and sampler/unit table, split
// out of ComputeFX.h so code that only needs to name a kind or look up its
// sampler/unit (no GL calls at all) doesn't have to pull in glcore.h too.
// See PresetEditor/ComputeFXPreview.h for why that split matters there.
#pragma once

// Sim identities.  Adding one = an entry here + a row in kCfxInfo (ComputeFX.cpp)
// + a step function in ComputeFX; nothing else in the engine needs to change.
enum CfxKind
{
	CFX_FLAME = 0,     // fractal flames (IFS + atomic density histogram)
	CFX_PARTICLES,     // millions of particles advected through a flow field
	CFX_NBODY,         // gravitational N-body galaxy (shared-memory tiling)
	CFX_BOIDS,         // flocking with a real spatial-hash neighbourhood
	CFX_CRYSTAL,       // diffusion-limited aggregation (frost / coral)
	CFX_LIGHTNING,     // dielectric breakdown (Laplace field + growth)
	CFX_CAUSTICS,      // wave surface + photon splatting
	CFX_PIXELSORT,     // per-row bitonic luminance sort (glitch melt)
	CFX_FFT,           // 2D FFT: the audio spectrum filters the image spectrum
	CFX_FERRO,         // ferrofluid spikes (surface tension + magnetic field)
	CFX_EROSION,       // hydraulic erosion heightfield
	CFX_METAL,         // screen-space fluid (metaball mercury)
	CFX_SHARDS,        // shatter & reassemble
	CFX_NSFLUID,       // Navier-Stokes with a real pressure projection
	CFX_CLOTH,         // XPBD cloth as a displacement field
	CFX_SCULPT,        // 3D scalar field, raymarched isosurface
	CFX_COUNT
};

struct CfxInfo
{
	const char *sampler;   // uniform name an effect declares to request this sim
	int         unit;      // global texture unit it is published on
};
extern const CfxInfo kCfxInfo[CFX_COUNT];   // defined in ComputeFX.cpp
