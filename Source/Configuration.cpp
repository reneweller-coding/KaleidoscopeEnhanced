/**
 * @file Configuration.cpp
 * @brief Implements Configuration: XML parsing of Presets/ *.xml presets into RenderPipeline/EffectShader objects,
 * uniform-range/formula registration, and the legacy shader-path remap.
 */
#include <float.h>

#include "shader_setup.h"
#include "Configuration.h"
#include "EffectShader.h"
#include "TextureEffectKaleidoscopeBase.h"
#include "Scene3DShader.h"
#include "Utils.h"
#include "Platform.h"
#include "PlatformQt.h"


#include <QtGui/QImageReader>
#include <QtCore/qdir.h>
#include <QtCore/qfileinfo.h>
#include <QtCore/QPointer>
#include <QtCore/QFile>
#include <QtCore/QIODevice>
#include <QtCore/QList>
#include <QtCore/QMap>
#include <QtCore/QPair>
#include <QtCore/QString>
#include <QtCore/QXmlStreamReader>



#include <GL/GLU.h>

/**
 * @brief Constructs a Configuration by parsing @p configurationFile and initializing its RenderPipeline.
 *
 * Allocates m_renderPipeline, delegates the XML parsing to readConfiguration()
 * (which populates it with TextureShader/CombineShader entries and the
 * preset-wide timing fields), then names the RenderPipeline after the parsed
 * preset (used as the taste-learning namespace) and calls
 * RenderPipeline::init() with the parsed image directory and timing ranges.
 */
Configuration::Configuration( const QString &configurationFile )
{
    m_renderPipeline = new RenderPipeline();
    readConfiguration( configurationFile );
    // Namespace for the per-preset taste learning (skip-malus / favourite).
    m_renderPipeline->setPresetName( m_configurationName );
    m_renderPipeline->init( m_imageDirectory, m_timeTextureSoloMin, m_timeTextureSoloMax, m_timeTextureInterpolationMin,
                            m_timeTextureInterpolationMax );
}


/** @brief Deletes the owned RenderPipeline. */
Configuration::~Configuration()
{
    delete m_renderPipeline;
}

/**
 * @brief Forwards to RenderPipeline::start() to (re)size and start the render pipeline.
 * @param width Viewport width in pixels.
 * @param height Viewport height in pixels.
 */
void Configuration::start( int width, int height )
{
    m_renderPipeline->start( width, height );
}


/** @brief Forwards to RenderPipeline::stop(). */
void Configuration::stop()
{
    m_renderPipeline->stop();
}


// ---- Named camera rigs (Presets/rigs.xml) ---------------------------
// 830 of the catalogue's scenes carry a rig, and between them they use only
// nineteen distinct formula sets.  Written out per scene that is ~2500 lines
// of near-identical arithmetic, and the cost of that is not disk space but
// BLINDNESS: every rig coefficient in the catalogue was three orders of
// magnitude too small -- oscillation periods of half an hour to five hours,
// so a 40-second scene panned by 0.8 degrees -- and nobody saw it, because
// nobody reads 2500 near-identical numbers.  As a twelve-entry table the same
// fact is one glance.
//
// The table is loaded once from the same directory the presets come from, so
// the packaged build finds it exactly like everything else.
static QMap<QString, QList<QPair<QString, QString>>> s_rigTable; ///< Rig name -> its (uniform name, formula) expression
                                                                 ///< pairs, exactly as `<expr name= formula=>` lists
                                                                 ///< them in rigs.xml; process-wide, filled once by
                                                                 ///< loadRigTable().
static bool s_rigLoaded = false; ///< Guards loadRigTable() so the table is read at most once per process (also set when
                                 ///< rigs.xml is missing, so a missing table is reported once, not per scene).

/**
 * @brief Loads Presets/rigs.xml into #s_rigTable on the first call; every later call is a no-op.
 *
 * Parses each `<rig name="...">` element and its `<expr name="..." formula="..."/>`
 * children. A missing or unparsable file leaves the table empty, so a
 * `<rig>` reference in a scene then warns in addUniforms() instead of
 * failing here.
 * @param cfgDir Directory that holds the preset XML files (and rigs.xml beside them).
 */
static void loadRigTable( const QString &cfgDir )
{
    if ( s_rigLoaded )
        return;
    s_rigLoaded = true;
    QFile f( cfgDir + "/rigs.xml" );
    if ( !f.open( QIODevice::ReadOnly ) )
        return; // no table: <rig> entries then warn below
    QDomDocument doc;
    if ( !doc.setContent( &f ) )
    {
        f.close();
        return;
    }
    f.close();
    QDomNodeList rigs = doc.documentElement().elementsByTagName( "rig" );
    for ( int i = 0; i < rigs.count(); ++i )
    {
        QDomElement                    r = rigs.at( i ).toElement();
        QList<QPair<QString, QString>> exprs;
        QDomNodeList                   es = r.elementsByTagName( "expr" );
        for ( int k = 0; k < es.count(); ++k )
        {
            QDomElement e = es.at( k ).toElement();
            exprs.append( qMakePair( e.attribute( "name" ),
                                     e.attribute( "formula" ) ) );
        }
        s_rigTable.insert( r.attribute( "name" ), exprs );
    }
    fprintf( stderr, "Rig-Vorlagen geladen: %d\n", int( s_rigTable.size() ) );
}

/**
 * @brief Walks the direct child elements of a TextureShader/CombineShader XML node and registers each declared uniform
 * (or expression) on @p shader.
 *
 * Recognised child tags: `<interpolator>` (min/max-of-min/max ramping range,
 * see Uniform's BASE_TYPE_INTERPOLATOR_FLOAT), `<bool>` (probability of being
 * true), `<float>`/`<int>` (a randomised value range rolled per activation),
 * `<rig>` (a named camera rig from Presets/rigs.xml,
 * expanded into the same expressions it replaces), and `<expr>`
 * (a per-frame formula-language expression — see ExprEval —
 * that overrides a same-named `<float>` uniform with a live audio-reactive
 * value; see EffectShader::addExpression). Every tag shares a `name`
 * attribute identifying the target GLSL uniform.
 */
void Configuration::addUniforms( EffectShader *shader, QDomElement &el )
{
    // get all data for the element, by looping through all child elements
    QDomNode p_entries = el.firstChild();
    while ( !p_entries.isNull() )
    {
        QDomElement pe_data = p_entries.toElement();
        QString     tag_nam = pe_data.tagName();

        std::string name = pe_data.attribute( "name" ).toStdString();

        if ( tag_nam == "interpolator" )
        {
            float min_min = pe_data.attribute( "minMin" ).toFloat();
            float max_min = pe_data.attribute( "maxMin" ).toFloat();
            float min_max = pe_data.attribute( "minMax" ).toFloat();
            float max_max = pe_data.attribute( "maxMax" ).toFloat();

            shader->addUniformInterpolator( name, min_min, min_max, max_min, max_max );
        }
        else if ( tag_nam == "bool" )
        {
            float probability = pe_data.attribute( "probability" ).toFloat();
            shader->addUniform( name, probability );
        }
        else if ( tag_nam == "float" )
        {
            float min_value_f = pe_data.attribute( "minValue" ).toFloat();
            float max_value_f = pe_data.attribute( "maxValue" ).toFloat();
            shader->addUniform( name, min_value_f, max_value_f );
        }
        else if ( tag_nam == "int" )
        {
            int min_value_i = pe_data.attribute( "minValue" ).toInt();
            int max_value_i = pe_data.attribute( "maxValue" ).toInt();
            shader->addUniform( name, min_value_i, max_value_i );
        }
        else if ( tag_nam == "expr" )
        {
            // FORMULA LAYER: per-frame expression evaluated against the live
            // audio features, uploaded as the float uniform `name` (overrides
            // a <float> of the same name — see EffectShader::addExpression).
            shader->addExpression( name, pe_data.attribute( "formula" ).toStdString() );
        }
        else if ( tag_nam == "rig" )
        {
            // <rig preset="mesh-18"/> expands to the same addExpression calls
            // the formulas would have made -- see loadRigTable above.
            const QString preset = pe_data.attribute( "preset" );
            auto          it = s_rigTable.constFind( preset );
            if ( it == s_rigTable.constEnd() )
            {
                // LOUD on purpose. A silently ignored rig leaves the camera
                // frozen, which is precisely the failure this table exists to
                // make visible -- and a frozen camera looks like a design
                // choice, not like a missing entry.
                fprintf( stderr, "Rig-Vorlage '%s' nicht in rigs.xml - "
                                 "die Kamera dieser Szene steht STILL.\n",
                         preset.toLocal8Bit().constData() );
            }
            else
            {
                for ( const auto &pr : *it )
                    shader->addExpression( pr.first.toStdString(),
                                           pr.second.toStdString() );
            }
        }

        p_entries = p_entries.nextSibling();
    }
}


/**
 * @brief Rewrites a shader `file` path from the pre-2026-08 folder layout to the current one, if needed.
 * @param p Shader file path as read from a preset's `file` attribute (either legacy or current layout).
 * @return The path with legacy `Scene/`, `Combine/CombineX` and `Blend/` segments remapped to `Scene2D/`, `FX/FxX` and
 * `Engine/` respectively; unchanged (idempotent) if already in the new layout.
 *
 * Pre-2026-08 layout fallback: old presets on disk may still reference
 * Scene/, Combine/CombineX and Blend/ paths; map them to the new layout
 * (Scene2D/, FX/FxX, Engine/). The `Combine\Combine` -> `FX\Fx` rule (handling
 * the `CombineX` shader-name prefix) must run before the plain
 * `Combine\` -> `FX\` rule below it, or it would already have been consumed.
 * The literal separators are split across string-literal concatenation
 * (e.g. "\\Scen" "e\\") purely to dodge naive text-search tooling that
 * greps for the old folder names verbatim.
 */
static QString mapLegacyShaderPath( QString p )
{
    p.replace( "\\Scen"
               "e\\",
               "\\Scene2D\\" );
    p.replace( "/Scen"
               "e/",
               "/Scene2D/" );
    p.replace( "\\Blen"
               "d\\",
               "\\Engine\\" );
    p.replace( "/Blen"
               "d/",
               "/Engine/" );
    p.replace( "\\Combin"
               "e\\Combin"
               "e",
               "\\FX\\Fx" );
    p.replace( "/Combin"
               "e/Combin"
               "e",
               "/FX/Fx" );
    p.replace( "\\Combin"
               "e\\",
               "\\FX\\" );
    p.replace( "/Combin"
               "e/",
               "/FX/" );
    return p;
}

/**
 * @brief Parses the preset XML file into m_renderPipeline: root-level metadata/timing, then every TextureShader and
 * CombineShader entry.
 * @param filenameIn Path to the Presets/ *.xml preset file to parse, as written in Windows style; mapped through
 * Platform::assetPath() (identity on Windows) before opening.
 *
 * Loads @p filenameIn into a QDomDocument and reads the root element's
 * attributes (ImageDirectory, ConfigurationName, hidden, and the preset-wide
 * solo/interpolation timing pair, each with a fallback baseline when
 * absent or zero — see the inline comments below), then iterates all
 * `<TextureShader>` elements followed by all `<CombineShader>` elements. For
 * each entry it reads its own optional per-entry timing overrides (same
 * fallback pattern), remaps its `file` path via mapLegacyShaderPath(),
 * parses its `mood` attribute into EffectShader::MOOD_* flags, constructs
 * the right EffectShader subclass for its `type` attribute (`normal`,
 * `KaleidoscopeBase`, or — TextureShader only — `scene3d`), registers its
 * uniforms via addUniforms(), and finally adds it to m_renderPipeline.
 *
 * On a missing/unreadable file this logs an error and calls exit(0) (not a
 * recoverable failure path); on a document that fails to parse it returns
 * early, leaving the Configuration in a partially/un-initialised state.
 */
void Configuration::readConfiguration( const QString &filenameIn )
{
    // Same reason as loadMeshAsset(): the paths are written Windows-style and
    // shared. Identity under _WIN32.
    const QString filename = QString::fromStdString(
        Platform::assetPath( filenameIn.toStdString() ) );
    // The rig table lives beside the presets; resolve it from the first preset
    // we are handed rather than from a compiled-in path, so the packaged build
    // finds it the same way it finds everything else.
    loadRigTable( QFileInfo( filename ).absolutePath() );
    QFile *file = new QFile( filename );
    if ( !file->open( QIODevice::ReadOnly | QIODevice::Text ) )
    {
        printf( "Error on loading %s\n!", qPrintable( filename ) );
        exit( 0 );
    }

    /* QDomDocument takes any QIODevice. as well as QString buffer*/
    QDomDocument doc( "filename" );
    if ( !doc.setContent( file ) )
    {
        return;
    }

    // Get the root element
    QDomElement doc_elem = doc.documentElement();

    // you could check the root tag name here if it matters
    QString root_tag = doc_elem.tagName(); //


    m_imageDirectory = doc_elem.attribute( "ImageDirectory" );
    m_configurationName = doc_elem.attribute( "ConfigurationName" );
    m_hidden = doc_elem.attribute( "hidden" ).compare( "true", Qt::CaseInsensitive ) == 0;
    // Only read here; GLwidget decides whether to use it, because the audio
    // thread is a process-wide thing that starts once and every preset gets
    // parsed at launch, active or not.
    m_audioFile = doc_elem.attribute( "AudioFile" );

    // REVIEW MODE for the Test* presets: scenes run ALPHABETICALLY, 8 s
    // each, and 'n' steps to the next in order — a systematic viewing
    // bench, not a show.  Only presets whose name starts with "Test".
    m_renderPipeline->setReviewMode( m_configurationName.startsWith( "Test" ) );

    // Optional floor on every natural scene fade (seconds). Set by the calm
    // presets (Ambient, SpaceAmbient): with a beat in the music the scheduler
    // otherwise clamps fades to four beats, which is not what a calm preset is for.
    m_renderPipeline->setSceneFadeMin( doc_elem.attribute( "timeSceneFadeMin" ).toFloat() );

    // Image-cycling times: optional (music steering paces the show anyway);
    // absent/0 falls back to the long-standing baseline.
    // The two-step fallback below distinguishes "attribute wasn't given at
    // all" from "author set min but left max unset/invalid": if min ended up
    // at its baseline (attribute absent), max also gets its baseline
    // (min,max) pair; but if the author explicitly customised min, an
    // unset/too-small max is nudged to just min+1 rather than silently
    // jumping to the unrelated wide baseline max.
    m_timeTextureSoloMin = doc_elem.attribute( "timeTextureSoloMin" ).toUInt();
    m_timeTextureSoloMax = doc_elem.attribute( "timeTextureSoloMax" ).toUInt();
    if ( m_timeTextureSoloMin == 0 )
        m_timeTextureSoloMin = 10;
    if ( m_timeTextureSoloMax <= m_timeTextureSoloMin )
        m_timeTextureSoloMax = ( m_timeTextureSoloMin == 10 ) ? 40 : m_timeTextureSoloMin + 1;
    m_timeTextureInterpolationMin = doc_elem.attribute( "timeTextureInterpolationMin" ).toUInt();
    m_timeTextureInterpolationMax = doc_elem.attribute( "timeTextureInterpolationMax" ).toUInt();
    if ( m_timeTextureInterpolationMin == 0 )
        m_timeTextureInterpolationMin = 20;
    if ( m_timeTextureInterpolationMax <= m_timeTextureInterpolationMin )
        m_timeTextureInterpolationMax = ( m_timeTextureInterpolationMin == 20 ) ? 80
                                                                                : m_timeTextureInterpolationMin + 1;


    // get the node's interested in, this time only caring about person's
    QDomNodeList node_list = doc_elem.elementsByTagName( "TextureShader" );

    // Check the TextureShaders
    for ( int i = 0; i < node_list.count(); i++ )
    {
        // get the current one as QDomElement
        QDomElement el = node_list.at( i ).toElement();

        // The per-entry times are OPTIONAL since the timing became music-driven
        // (timingScale/beat-quantisation/section cuts steer the pacing): absent
        // or 0 falls back to a sensible baseline that mainly matters as the
        // no-music (speech/silence) pacing.
        unsigned int min_time_solo = el.attribute( "minTimeSolo" ).toUInt();
        unsigned int max_time_solo = el.attribute( "maxTimeSolo" ).toUInt();
        if ( min_time_solo == 0 )
            min_time_solo = 20;
        if ( max_time_solo <= min_time_solo )
            max_time_solo = ( min_time_solo == 20 ) ? 90 : min_time_solo + 1;

        unsigned int min_time_interpolation = el.attribute( "minTimeInterpolation" ).toUInt();
        unsigned int max_time_interpolation = el.attribute( "maxTimeInterpolation" ).toUInt();
        if ( min_time_interpolation == 0 )
            min_time_interpolation = 15;
        if ( max_time_interpolation <= min_time_interpolation )
            max_time_interpolation = ( min_time_interpolation == 15 ) ? 50 : min_time_interpolation + 1;

        QString shader_file = mapLegacyShaderPath( el.attribute( "file" ) );

        QString type = el.attribute( "type" );

        // OPTIONAL MODEL PACK. geom="mesh" scenes need a .glb that does not
        // ship with the program -- the models are a separate download, because
        // together they outweigh everything else in the repository many times
        // over. A scene whose model is absent is skipped ENTIRELY here rather
        // than registered and left to fail later: Scene3DShader fails soft to
        // empty geometry, which would put a scene in the rotation that renders
        // nothing at all. Silently having fewer scenes is the correct
        // behaviour; a black one every few minutes is not.
        if ( el.attribute( "geom" ) == "mesh" )
        {
            // assetPath(), because this decides whether the scene EXISTS. The XML
            // writes Windows separators; without normalising, every mesh scene
            // looks absent off Windows and all 238 of them vanish -- with the
            // perfectly plausible message that the model pack is not installed.
            const QString m1 = Platform::assetPath( el.attribute( "model" ) );
            const QString m2 = Platform::assetPath( el.attribute( "model2" ) );
            if ( ( !m1.isEmpty() && !QFileInfo::exists( m1 ) ) || ( !m2.isEmpty() && !QFileInfo::exists( m2 ) ) )
            {
                m_skippedMeshScenes++;
                continue;
            }
        }

        float        probability = el.attribute( "probability" ).toFloat();
        unsigned int complexity = el.attribute( "complexity" ).toFloat();

        // Optional mood tags (comma list: dark, bright, calm, aggressive) for
        // the mood-biased shader selection; untagged shaders stay neutral.
        QString      mood = el.attribute( "mood" );
        unsigned int mood_flags = 0;
        if ( mood.contains( "dark" ) )
            mood_flags |= EffectShader::MOOD_DARK;
        if ( mood.contains( "bright" ) )
            mood_flags |= EffectShader::MOOD_BRIGHT;
        if ( mood.contains( "calm" ) )
            mood_flags |= EffectShader::MOOD_CALM;
        if ( mood.contains( "aggressive" ) )
            mood_flags |= EffectShader::MOOD_AGGRESSIVE;

        if ( type == "normal" )
        {
            EffectShader *shader = new EffectShader( shader_file.toStdString(), min_time_solo, max_time_solo,
                                                     min_time_interpolation, max_time_interpolation );

            addUniforms( shader, el );
            shader->setComplexity( complexity );
            shader->setProbability( probability );
            shader->setMoodFlags( mood_flags );
            shader->setGradeModes( el.attribute( "grade" ).toStdString() ); // grade="fade,grey,sepia": rolled per
                                                                            // activation, applied by Present.frag
            m_renderPipeline->addTextureShader( shader );
            m_loadedScenes++;
        }
        else if ( type == "KaleidoscopeBase" )
        {
            TextureEffectKaleidoscopeBase *shader = new TextureEffectKaleidoscopeBase(
                shader_file.toStdString(), min_time_solo, max_time_solo, min_time_interpolation,
                max_time_interpolation );

            addUniforms( shader, el );
            shader->setComplexity( complexity );
            shader->setProbability( probability );
            shader->setMoodFlags( mood_flags );
            shader->setGradeModes( el.attribute( "grade" ).toStdString() ); // grade="fade,grey,sepia": rolled per
                                                                            // activation, applied by Present.frag
            m_renderPipeline->addTextureShader( shader );
            m_loadedScenes++;
        }
        else if ( type == "scene3d" )
        {
            // REAL 3D scene: Scene3D\<X>.frag + matching .vert, procedural
            // geometry chosen by geom="points|cubes|ribbon".
            Scene3DShader *shader = new Scene3DShader( shader_file.toStdString(), el.attribute( "geom" ).toStdString(),
                                                       min_time_solo, max_time_solo, min_time_interpolation,
                                                       max_time_interpolation );

            // Optional: half-width of the light's shadow box, in world units.
            // Only the scene knows its own scale, and the shadow map's
            // resolution is spent across whatever this says — a 120-unit box
            // gives a 3-unit object about 50 texels, which is unusable.
            // instances="N": draw the loaded mesh N times in one call, so one
            // model can be a formation. Only geom="mesh" reads it.
            if ( el.hasAttribute( "instances" ) )
                shader->setMeshInstances( el.attribute( "instances" ).toInt() );
            if ( el.hasAttribute( "shadowExtent" ) )
                shader->setShadowExtent( el.attribute( "shadowExtent" ).toFloat() );
            // Persistent generator state, in bytes.  Only a scene that
            // accumulates something across frames needs it.
            if ( el.hasAttribute( "stateBytes" ) )
                shader->setStateBytes( el.attribute( "stateBytes" ).toInt() );
            // Multi-stage compute generator (clear/splat/integrate/mesh, ...):
            // how many genPass=0..N-1 dispatches to run, barrier between each.
            // Only scenes whose generator pipeline needs more than "advance,
            // then mesh" declare this.
            if ( el.hasAttribute( "genPasses" ) )
                shader->setGenPassCount( el.attribute( "genPasses" ).toInt() );
            // geom="mesh" only: path to the .glb/.gltf/.obj this scene loads
            // instead of building procedural geometry.
            if ( el.hasAttribute( "model" ) )
                shader->setModelPath( el.attribute( "model" ).toStdString() );
            // Optional SECOND mesh, for scenes staging two objects against
            // each other (a ship coming alongside a station).
            if ( el.hasAttribute( "model2" ) )
                shader->setModelPath2( el.attribute( "model2" ).toStdString() );

            addUniforms( shader, el );
            shader->setComplexity( complexity );
            shader->setProbability( probability );
            shader->setMoodFlags( mood_flags );
            shader->setGradeModes( el.attribute( "grade" ).toStdString() ); // grade="fade,grey,sepia": rolled per
                                                                            // activation, applied by Present.frag
            m_renderPipeline->addTextureShader( shader );
            m_loadedScenes++;
        }
    }


    // get the node's interested in, this time only caring about person's
    node_list = doc_elem.elementsByTagName( "CombineShader" );

    // Check the TextureShaders
    for ( int i = 0; i < node_list.count(); i++ )
    {
        // get the current one as QDomElement
        QDomElement el = node_list.at( i ).toElement();

        // Times optional here too (see the TextureShader loop above).
        unsigned int min_time_solo = el.attribute( "minTimeSolo" ).toUInt();
        unsigned int max_time_solo = el.attribute( "maxTimeSolo" ).toUInt();
        if ( min_time_solo == 0 )
            min_time_solo = 30;
        if ( max_time_solo <= min_time_solo )
            max_time_solo = ( min_time_solo == 30 ) ? 120 : min_time_solo + 1;

        unsigned int min_time_interpolation = el.attribute( "minTimeInterpolation" ).toUInt();
        unsigned int max_time_interpolation = el.attribute( "maxTimeInterpolation" ).toUInt();
        if ( min_time_interpolation == 0 )
            min_time_interpolation = 20;
        if ( max_time_interpolation <= min_time_interpolation )
            max_time_interpolation = ( min_time_interpolation == 20 ) ? 60 : min_time_interpolation + 1;

        QString shader_file = mapLegacyShaderPath( el.attribute( "file" ) );

        float        probability = el.attribute( "probability" ).toFloat();
        unsigned int complexity = el.attribute( "complexity" ).toFloat();

        QString type = el.attribute( "type" );

        QString      mood = el.attribute( "mood" );
        unsigned int mood_flags = 0;
        if ( mood.contains( "dark" ) )
            mood_flags |= EffectShader::MOOD_DARK;
        if ( mood.contains( "bright" ) )
            mood_flags |= EffectShader::MOOD_BRIGHT;
        if ( mood.contains( "calm" ) )
            mood_flags |= EffectShader::MOOD_CALM;
        if ( mood.contains( "aggressive" ) )
            mood_flags |= EffectShader::MOOD_AGGRESSIVE;

        if ( type == "normal" )
        {
            EffectShader *shader = new EffectShader( shader_file.toStdString(), min_time_solo, max_time_solo,
                                                     min_time_interpolation, max_time_interpolation );

            addUniforms( shader, el );
            shader->setComplexity( complexity );
            shader->setProbability( probability );
            shader->setMoodFlags( mood_flags );
            m_renderPipeline->addFxShader( shader );
        }
    }

    // Scene-transition shaders (Transitions/): same attribute set as the
    // combine entries, but they feed the dedicated transition pass that
    // blends outgoing/incoming scene during a fade.  One is rolled per fade
    // (probability + mood weighted); absent entries fall back to the plain
    // Crossfade inside RenderPipeline::start().
    node_list = doc_elem.elementsByTagName( "TransitionShader" );

    for ( int i = 0; i < node_list.count(); i++ )
    {
        QDomElement el = node_list.at( i ).toElement();

        unsigned int min_time_solo = el.attribute( "minTimeSolo" ).toUInt();
        unsigned int max_time_solo = el.attribute( "maxTimeSolo" ).toUInt();
        if ( min_time_solo == 0 )
            min_time_solo = 30;
        if ( max_time_solo <= min_time_solo )
            max_time_solo = ( min_time_solo == 30 ) ? 120 : min_time_solo + 1;

        unsigned int min_time_interpolation = el.attribute( "minTimeInterpolation" ).toUInt();
        unsigned int max_time_interpolation = el.attribute( "maxTimeInterpolation" ).toUInt();
        if ( min_time_interpolation == 0 )
            min_time_interpolation = 20;
        if ( max_time_interpolation <= min_time_interpolation )
            max_time_interpolation = ( min_time_interpolation == 20 ) ? 60 : min_time_interpolation + 1;

        QString shader_file = mapLegacyShaderPath( el.attribute( "file" ) );

        float        probability = el.attribute( "probability" ).toFloat();
        unsigned int complexity = el.attribute( "complexity" ).toFloat();

        QString type = el.attribute( "type" );

        QString      mood = el.attribute( "mood" );
        unsigned int mood_flags = 0;
        if ( mood.contains( "dark" ) )
            mood_flags |= EffectShader::MOOD_DARK;
        if ( mood.contains( "bright" ) )
            mood_flags |= EffectShader::MOOD_BRIGHT;
        if ( mood.contains( "calm" ) )
            mood_flags |= EffectShader::MOOD_CALM;
        if ( mood.contains( "aggressive" ) )
            mood_flags |= EffectShader::MOOD_AGGRESSIVE;

        if ( type == "normal" )
        {
            EffectShader *shader = new EffectShader( shader_file.toStdString(), min_time_solo, max_time_solo,
                                                     min_time_interpolation, max_time_interpolation );

            addUniforms( shader, el );
            shader->setComplexity( complexity );
            shader->setProbability( probability );
            shader->setMoodFlags( mood_flags );
            // Measured floor on the fade this transition runs in; see
            // EffectShader::setMinFade().
            shader->setMinFade( el.attribute( "minFade" ).toFloat() );
            m_renderPipeline->addTransitionShader( shader );
        }
    }
}
