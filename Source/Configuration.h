//---------------------------------------------------------------------------
//                              Configuration
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  Loader for a single preset/config XML file (Presets/ *.xml) into the runtime shader/uniform object graph.
 *
 *  @author René Weller
 */

#ifndef CONFIGURATION_H
#define CONFIGURATION_H

#include <QtGui/qopengl.h>
#include <QtCore/QElapsedTimer>
#include <QtCore/QThread>

#include <QtXml/QDomDocument>
#include <QtXml/QDomElement>
#include <QtXml/QDomNodeList>

#include "stdinc.h"
#include "Uniform.h"
#include "RenderPipeline.h"

/** @class Configuration
 *
 * Parses one preset XML file and builds the RenderPipeline/EffectShader object graph it describes.
 *
 * A Configuration corresponds 1:1 to a Presets/ *.xml preset file: its
 * constructor parses the document (readConfiguration()) into a freshly
 * allocated RenderPipeline, wiring up every TextureShader / CombineShader entry
 * (including their per-uniform ranges and `<expr>` formulas) and the preset's
 * image-cycling timing/mood metadata. It owns that RenderPipeline for the
 * lifetime of the Configuration and deletes it in the destructor. start()/
 * stop() just forward to the owned RenderPipeline; isHidden() exposes whether
 * this preset is a reference/test-bench build that should be excluded from
 * user-facing selection.
 **/
class Configuration
{
public:
    /**  Loads and parses a preset XML file, building the full shader/uniform graph.
     *
     * @param configurationFile  Path to the Presets/ *.xml preset file to load. (in)
     **/
    explicit Configuration( const QString &configurationFile );
    /** Destroys the owned RenderPipeline (and, transitively, everything it built). */
    ~Configuration();

    /**  The preset's display name, as shown in the menu / matched by `-c <name>`.
     *
     * @return
     *   The root element's ConfigurationName attribute (empty if the preset had none).
     **/
    QString getConfigurationName() { return m_configurationName; };
    /**  The file this preset was read from.
     *
     * @return
     *   Its path as given to the constructor (separators normalised).
     **/
    QString sourceFile() const { return m_sourceFile; }
    // hidden="true" on the root element: a master/reference or test-bench
    // preset that must not appear in the user-facing selection (menu, digit
    // keys, web remote, auto-config).  Still loadable via -c <name>.
    /**  Whether this preset is hidden from user-facing selection (still loadable explicitly via `-c <name>`).
     *
     * @return
     *   True if the root element had `hidden="true"`.
     **/
    bool isHidden() const { return m_hidden; }

    /**  Audio file this preset wants analysed instead of the live input.
     *
     * @return
     *   Path as written in the XML, or empty.
     *
     *  Empty for every normal preset -- the point of the program is to react to
     *  whatever is playing. A REVIEW preset is the exception: it has to show the
     *  same scene the same way twice, which live audio cannot do, so it names a
     *  fixed WAV and the engine analyses that silently instead of listening.
     *  A -w or -x on the command line outranks it.
     **/
    QString audioFile() const { return m_audioFile; }
    /**  Starts the owned RenderPipeline's GL resources/scheduler for the given viewport size.
     *
     * @param width   Viewport width in pixels. (in)
     * @param height  Viewport height in pixels. (in)
     **/
    void start( int width, int height ) const;
    /** Stops the owned RenderPipeline (releases its running state). */
    void stop() const;

    /**  The shader/scene pipeline built by readConfiguration().
     *
     * @return
     *   It; owned by this configuration.
     **/
    RenderPipeline *renderPipeline() const { return m_renderPipeline; }
    /**  Mesh scenes skipped for a missing model file.
     *
     * @return
     *   Their number (see m_skippedMeshScenes).
     **/
    int skippedMeshScenes() const { return m_skippedMeshScenes; }
    /**  Scenes this preset actually built.
     *
     * @return
     *   Their number (see m_loadedScenes).
     **/
    int loadedScenes() const { return m_loadedScenes; }

private:
    RenderPipeline *m_renderPipeline; ///< The shader/scene pipeline built by readConfiguration(); owned (deleted in the
                                      ///< destructor).

    /** How many geom="mesh" scenes readConfiguration() skipped because their model file was not installed.
     *
     * The 3D models are an OPTIONAL separate download (they dwarf the rest of the program), so a plain install
     * legitimately has none of them -- this is reported once at startup so the smaller scene count is explained rather
     * than mysterious.
     **/
    int m_skippedMeshScenes = 0;

    /** How many scenes this preset actually built.
     *
     * A preset made ENTIRELY of geom="mesh" scenes comes to nothing without the optional model pack, and RenderPipeline
     * would then quietly substitute a pass-through -- a menu entry that shows the photos and nothing else. glwidget
     * hides such a preset instead; see the hidden-list pass. No shipped preset is that today, but the guard is what
     * makes adding one safe.
     **/
    int m_loadedScenes = 0;

    /**  Parses the preset XML document and populates m_renderPipeline with its TextureShader/CombineShader entries.
     *
     * Takes the path of the Presets/ *.xml preset file; the parameter is
     * documented on the definition in Configuration.cpp.
     **/
    void readConfiguration( const QString &filenameIn );
    /**  Reads a shader element's child uniform-declaration tags (interpolator/bool/float/int/expr) and registers them
     * on the shader.
     *
     * @param shader  The EffectShader (or subclass) to register the parsed uniforms/expressions on. (in)
     * @param el      The `<TextureShader>` or `<CombineShader>` XML element whose children to walk. (in,out)
     **/
    void addUniforms( EffectShader *shader, QDomElement &el );

    QString m_imageDirectory;    ///< Root image directory for this preset (root element's ImageDirectory attribute),
                                 ///< passed to RenderPipeline::init().
    QString m_configurationName; ///< Preset display name (root element's ConfigurationName attribute); also used as the
                                 ///< taste-learning namespace.
    QString m_sourceFile;        ///< The file the preset was read from (for messages).
    bool    m_hidden = false;    ///< True when the root element has hidden="true" (excluded from user-facing preset
                                 ///< selection).
    QString m_audioFile;         ///< Optional AudioFile="..." from the root element; see audioFile().

    unsigned int m_timeTextureInterpolationMin; ///< Preset-wide minimum image cross-fade duration (seconds); falls back
                                                ///< to a baseline when absent/0 in the XML.
    unsigned int m_timeTextureInterpolationMax; ///< Preset-wide maximum image cross-fade duration (seconds); falls back
                                                ///< to a baseline when absent/invalid in the XML.
    unsigned int m_timeTextureSoloMin; ///< Preset-wide minimum time an image is held solo (seconds); falls back to a
                                       ///< baseline when absent/0 in the XML.
    unsigned int m_timeTextureSoloMax; ///< Preset-wide maximum time an image is held solo (seconds); falls back to a
                                       ///< baseline when absent/invalid in the XML.
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    Configuration( const Configuration & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    Configuration &operator=( const Configuration & ) = delete;
};


#endif
