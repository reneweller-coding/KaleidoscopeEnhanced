/**
 * @file CfxTypes.h
 * @brief Shared identities for the ComputeFX sims: which kinds exist and which
 *        sampler/texture unit each one publishes on.
 */
// CfxTypes.h — the compute-FX sim identities and sampler/unit table, split
// out of ComputeFX.h so code that only needs to name a kind or look up its
// sampler/unit (no GL calls at all) doesn't have to pull in glcore.h too.
// See PresetEditor/ComputeFXPreview.h for why that split matters there.
#pragma once

/**
 * @brief Identifies which GPU compute simulation an effect wants to sample.
 *
 * One value per independent compute-shader sim owned by ComputeFX (fractal
 * flames, particle advection, N-body gravity, and so on). Adding a new sim
 * only requires a new entry here, a matching row in kCfxInfo (ComputeFX.cpp)
 * giving it a sampler name and texture unit, and a stepXxx() function in
 * ComputeFX — nothing else in the engine needs to change. CFX_COUNT is not a
 * real kind; it is the sentinel used to size per-kind arrays.
 */
enum CfxKind
{
	CFX_FLAME = 0,     ///< fractal flames (IFS + atomic density histogram)
	CFX_PARTICLES,     ///< millions of particles advected through a flow field
	CFX_NBODY,         ///< gravitational N-body galaxy (shared-memory tiling)
	CFX_BOIDS,         ///< flocking with a real spatial-hash neighbourhood
	CFX_CRYSTAL,       ///< diffusion-limited aggregation (frost / coral)
	CFX_LIGHTNING,     ///< dielectric breakdown (Laplace field + growth)
	CFX_CAUSTICS,      ///< wave surface + photon splatting
	CFX_PIXELSORT,     ///< per-row bitonic luminance sort (glitch melt)
	CFX_FFT,           ///< 2D FFT: the audio spectrum filters the image spectrum
	CFX_FERRO,         ///< ferrofluid spikes (surface tension + magnetic field)
	CFX_EROSION,       ///< hydraulic erosion heightfield
	CFX_METAL,         ///< screen-space fluid (metaball mercury)
	CFX_SHARDS,        ///< shatter & reassemble
	CFX_NSFLUID,       ///< Navier-Stokes with a real pressure projection
	CFX_CLOTH,         ///< XPBD cloth as a displacement field
	CFX_SCULPT,        ///< 3D scalar field, raymarched isosurface
	CFX_COUNT          ///< sentinel: number of sim kinds, not a real kind
};

/**
 * @brief The sampler name and texture unit a compute-FX kind publishes on.
 *
 * Each CfxKind gets exactly one entry: the uniform name an effect shader
 * must declare to opt into reading that sim's output, and the global texture
 * unit ComputeFX binds its result texture to. The table itself (kCfxInfo) is
 * defined in ComputeFX.cpp, indexed by CfxKind.
 */
struct CfxInfo
{
	const char *sampler;   ///< uniform name an effect declares to request this sim
	int         unit;      ///< global texture unit it is published on
};
extern const CfxInfo kCfxInfo[CFX_COUNT];   ///< per-kind sampler/unit table, defined in ComputeFX.cpp
