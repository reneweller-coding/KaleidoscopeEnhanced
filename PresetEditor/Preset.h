/**
 * @file Preset.h
 * @brief In-memory preset data model plus its XML load/save.
 *
 * Preset.h — the preset data model + XML load/save, shared by the editor GUI and
 * the headless --roundtrip self-test.  Matches the schema read by the main app's
 * Configuration.cpp exactly:
 *
 * @code
 *   <configuration ImageDirectory=".." ConfigurationName=".."
 *                  timeTextureSoloMin/Max timeTextureInterpolationMin/Max>
 *     <TextureShader minTimeSolo maxTimeSolo minTimeInterpolation
 *                    maxTimeInterpolation file type probability complexity>
 *       <bool  name= probability=/>
 *       <int   name= minValue= maxValue=/>
 *       <float name= minValue= maxValue=/>
 *       <interpolator name= minMin= maxMin= minMax= maxMax=/>
 *     </TextureShader>
 *     <CombineShader .../>  (type="normal" only)
 *   </configuration>
 * @endcode
 */
#pragma once

#include <QtCore/QString>
#include <QtCore/QVector>

/**
 * @brief One `<bool>`/`<int>`/`<float>`/`<interpolator>`/`<expr>` child element of a shader entry.
 *
 * Stored as raw attribute strings rather than parsed numbers, so an existing
 * preset round-trips losslessly through Preset::load()/Preset::save() even
 * for values this editor never specifically interprets. The @c kind field
 * selects which of the other fields are meaningful for a given instance;
 * fields that don't apply to the current @c kind are simply left empty.
 */
struct ShaderParam
{
    QString kind;     ///< "bool" | "int" | "float" | "interpolator" | "expr"
    QString name;     ///< Uniform/parameter name as declared in the shader.
    QString probability;                 ///< bool: probability [0,1] the flag rolls true.
    QString minValue, maxValue;          ///< int / float: inclusive range the value is randomly rolled from.
    QString minMin, maxMin, minMax, maxMax;  ///< interpolator: roll ranges for the interpolated min and max endpoints.
    QString formula;                     ///< expr (formula layer): ExprEval source text; empty = engine/random default.
};

/**
 * @brief One `<TextureShader>` or `<CombineShader>` entry within a Preset.
 *
 * Represents a single shader-activation slot: which shader file to run (and,
 * for scene3d, its geometry/state settings), how long it solos and
 * interpolates, how likely and how complex it is, and the list of
 * per-activation ShaderParam rows that tune its uniforms. @c isCombine
 * distinguishes a `<CombineShader>` (an FX blend pass) from a `<TextureShader>`
 * (a scene). Instances are produced by Preset::load() or by the editor's
 * "Add texture effect"/"Add combine" actions (EditorWindow::addTextureEntry()/
 * addCombineEntry()).
 */
struct PresetEntry
{
    bool     isCombine = false;   ///< true = `<CombineShader>` (FX blend pass); false = `<TextureShader>` (scene).
    /**
     * @brief Folder segment of the file= attribute ("Scene2D" | "Scene3D" | "FX").
     *
     * Carried explicitly because the BARE filename is ambiguous: a 2D
     * Scene2D/X.frag and a 3D Scene3D/X.frag can legitimately coexist
     * (CrystalGrowth does), and --validate matching on the bare name alone
     * checked one against the other's params.  Empty = infer from
     * isFX/type (pre-folder files round-trip unchanged).
     */
    QString  folder;
    QString  file;               ///< Bare filename, e.g. "Kaleidoscope.frag" (folder stripped; see #folder).
    QString  type = "normal";    ///< "normal" | "KaleidoscopeBase" | "scene3d"
    QString  geom;                ///< scene3d only: "points" | "cubes" | "ribbon" | ...
    // scene3d only, both optional (0 = attribute omitted, matching Configuration.cpp):
    int      stateBytes   = 0;    ///< scene3d only: persistent generator state buffer size; 0 = attribute omitted.
    double   shadowExtent = 0.0;  ///< scene3d only: shadow-box half-width; 0 = engine default.
    int      minTimeSolo = 20, maxTimeSolo = 80;   ///< Random range this entry solos alone before interpolating to the next.
    int      minTimeInterpolation = 15, maxTimeInterpolation = 50;   ///< Random range for the crossfade/interpolation duration into the next entry.
    double   probability = 0.5;   ///< Relative selection weight/probability when the engine picks this entry.
    int      complexity = 1;      ///< Author-assigned complexity rating.
    QString  mood;                ///< Optional mood tags ("dark,calm", ...) — passed through, not interpreted here.
    QVector<ShaderParam> params;  ///< Per-activation parameter rows (bool/int/float/interpolator/expr) for this entry's shader.
};

/**
 * @brief One preset XML file's full contents: the in-memory model shared by the GUI and the headless self-tests.
 *
 * Mirrors the `<configuration>` root element: preset metadata, the global
 * texture-solo/interpolation timing defaults, and an ordered list of
 * PresetEntry (texture entries then combine entries). load()/save() are the
 * only way an instance talks to disk; the editor mutates one in place
 * (via EditorWindow) and calls save() to write it back into Configurations/.
 */
struct Preset
{
    QString name = "MyPreset";   ///< ConfigurationName attribute; also the on-disk filename stem when saved from the editor.
    QString imageDirectory;      ///< ImageDirectory attribute: folder of photos this preset's scenes draw tex0/tex1 from.
    /**
     * @brief hidden="true": the main app keeps this preset out of its user-facing selection.
     *
     * hidden="true": the main app keeps this preset out of its user-facing
     * selection (menu, digit keys, web remote); only -c `<name>` reaches it.
     * Used for master/reference presets (Komplett) and Test* benches.
     */
    bool    hidden = false;
    int     timeTextureSoloMin = 10,  timeTextureSoloMax = 40;              ///< Global min/max solo duration (root attributes).
    int     timeTextureInterpolationMin = 20, timeTextureInterpolationMax = 80;  ///< Global min/max interpolation duration (root attributes).
    QVector<PresetEntry> entries;   ///< texture + combine, in insertion order

    /**
     * @brief Load a preset from an XML file.
     * @param path Filesystem path of the preset XML to read.
     * @param out Destination; reset to a fresh Preset() and then filled from the parsed document.
     * @param err Optional; filled with a human-readable message on failure.
     * @return true on success; false if the file couldn't be opened or failed to parse (see @p err).
     */
    static bool load(const QString &path, Preset &out, QString *err = nullptr);
    /**
     * @brief Save this preset to an XML file.
     * @param path Filesystem path to write.
     * @param err Optional; filled with a human-readable message on failure.
     * @return true on success; false if the file couldn't be opened for writing.
     */
    bool save(const QString &path, QString *err = nullptr) const;
};
