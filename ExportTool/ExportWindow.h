//---------------------------------------------------------------------------
//                              ExportWindow
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  The Kaleidoscope Video Export tool's single window: preset, audio file, size, frame rate and a few options in,
 *  an mp4 out -- by running Kaleidoscope.exe in its export mode (-e, see Source/VideoExport.h) and following its
 *  progress.
 *
 *  @author René Weller
 */

#pragma once

#include <QtCore/QElapsedTimer>
#include <QtCore/QProcess>
#include <QtCore/QStringList>
#include <QtWidgets/QWidget>
#include "Strings.h"

class QCheckBox;
class QCloseEvent;
class QComboBox;
class QDragEnterEvent;
class QDragLeaveEvent;
class QDragMoveEvent;
class QDropEvent;
class QLabel;
class QLineEdit;
class QPlainTextEdit;
class QProgressBar;
class QPushButton;

/** @class ExportWindow
 *
 * A small front end for the video export: choose, start, watch, open the result.
 *
 * The rendering itself is Kaleidoscope.exe's (CLI -e and friends): the same engine, presets and look settings as
 * the live show, on a frame clock. This window only assembles the command line, finds the programs (the engine
 * next to it or in the development tree, the newest ffmpeg on the machine), shows the "[export]" lines the engine
 * prints as a progress bar and status text, and stops it on request -- "quit" on its stdin, which makes the engine
 * finish a playable file with the frames so far. The audio file can be dropped onto the window; the video is named
 * after it. Its choices are remembered in kaleidoscope_settings.ini (group videoExport), the language follows the
 * app's (key language). No moc: lambda connections only, like the SetupTool.
 **/
class ExportWindow : public QWidget
{
public:
    /** Builds the form, finds Kaleidoscope.exe and ffmpeg, and restores the last choices. */
    ExportWindow();

    /**  A scripted run, for testing the tool without anybody clicking: hands it the audio file (typed in, or as a
     * drop -- the events a drop from Explorer delivers, sent to the window), starts the export as soon as ffmpeg is
     * found, saves pictures of the window, and quits with the engine's exit code; 5 if the drop was refused
     * (main.cpp: --script-audio or --script-drop, --script-out, --script-shots).
     *
     * @param audio    The audio file. (in)
     * @param out      The output .mp4; empty keeps the one the tool proposes. (in)
     * @param shots    Path prefix of the window pictures, which get _ready.png, _running.png (past 40 %) and
     *                 _done.png appended. (in)
     * @param viaDrop  Deliver the file as a drag and drop instead of typing it in. (in)
     **/
    void scripted( const QString &audio, const QString &out, const QString &shots, bool viaDrop );

protected:
    /**  A close during an export asks first; yes cancels the export and waits for the file to be finished.
     *
     * @param e  The close event. (in)
     **/
    void closeEvent( QCloseEvent *e ) override;
    /**  A file dragged over the window: taken if it is an audio file and no export runs (the audio field lights up).
     *
     * @param e  The drag-enter event. (in)
     **/
    void dragEnterEvent( QDragEnterEvent *e ) override;
    /**  Keeps accepting the drag while it moves over the window's other widgets.
     *
     * @param e  The drag-move event. (in)
     **/
    void dragMoveEvent( QDragMoveEvent *e ) override;
    /**  The drag left the window: the audio field goes back to normal.
     *
     * @param e  The drag-leave event. (in)
     **/
    void dragLeaveEvent( QDragLeaveEvent *e ) override;
    /**  The dropped audio file becomes the source, as if picked with "Choose ...".
     *
     * @param e  The drop event. (in)
     **/
    void dropEvent( QDropEvent *e ) override;

private:
    /** One ffmpeg found on the machine. */
    struct Ffmpeg
    {
        QString path;    ///< The executable.
        QString version; ///< Its version as it reports it ("9.0.1", "6.1.1", "N-12345-g...").
    };

    /**  The install or repository root: the first folder above the program that holds Presets.
     *
     * @return
     *   Its absolute path; the program's own folder if none is found.
     **/
    static QString findRootDir();
    /**  kaleidoscope_settings.ini in the root.
     *
     * @return
     *   Its path.
     **/
    static QString settingsPath();
    /**  The presets on offer: every Presets\*.xml's ConfigurationName, hidden ones only if the ini's
     * showHiddenPresets says so.
     *
     * @return
     *   The names, sorted case-insensitively.
     **/
    static QStringList discoverPresets();
    /**  Kaleidoscope.exe: beside this program (an installed package), else in the development tree's Release folder.
     *
     * @return
     *   Its path, or an empty string.
     **/
    static QString findEngine();
    /**  The ffmpeg builds on this machine: the PATH's, winget's, scoop's, chocolatey's and the usual folders.
     *
     * @return
     *   Every one that answers -version, newest first.
     **/
    static QList<Ffmpeg> findFfmpegs();
    /**  What an ffmpeg executable reports as its version.
     *
     * @param exe  The executable. (in)
     *
     * @return
     *   The version text, or empty if it does not run.
     **/
    static QString ffmpegVersion( const QString &exe );

    /** Reads the chosen audio file with ffprobe and shows its length, format, frame count and size limit. */
    void probeAudio();
    /**  Makes a file the audio source -- picked, dropped or typed -- reads it and names the output after it.
     *
     * @param path  The audio file (quotes around it, as Explorer's "Copy as path" puts them, are dropped). (in)
     **/
    void setAudio( const QString &path );
    /** The output named after the audio file -- "Song.flac" becomes "Song.mp4" -- in the folder chosen for videos,
     * else beside the audio. An mp4 whose sound is exported gets " (Kaleidoscope)" added, never its own name.
     **/
    void updateDefaultOutput();
    /** After the output path was picked or typed: a folder other than the audio's is kept for the next files. */
    void noteOutputDir();
    /** Shows the chosen ffmpeg (or that none was found) in its label. */
    void showFfmpeg();
    /** Checks the inputs and starts Kaleidoscope.exe in export mode. */
    void startExport();
    /** Asks the running export to stop ("quit" on its stdin); kills it if it has not ended 20 s later. */
    void cancelExport();
    /**  Handles one line of the engine's stderr.
     *
     * @param line  The line, without its end. (in)
     **/
    void handleLine( const QString &line );
    /**  The engine ended: report done, cancelled or the error, and offer the result.
     *
     * @param code    Its exit code (0 done, 1 cancelled, 2 error, anything else a crash). (in)
     * @param status  Normal exit or crash. (in)
     **/
    void exportEnded( int code, QProcess::ExitStatus status );
    /**  Switches the form between editing and a running export.
     *
     * @param on  true while an export runs. (in)
     **/
    void setRunning( bool on );
    /**  Shows a status line.
     *
     * @param text   The text. (in)
     * @param error  Red instead of the normal colour. (in)
     **/
    void setStatus( const QString &text, bool error = false );
    /** Restores the last choices from the ini (group videoExport). */
    void loadSettings();
    /** Stores the current choices in the ini (group videoExport). */
    void saveSettings();
    /**  The video size of the resolution choice.
     *
     * @param w  Width in pixels. (out)
     * @param h  Height in pixels. (out)
     **/
    void videoSize( int &w, int &h ) const;
    /**  The frame rate of the frame-rate choice.
     *
     * @return
     *   Frames per second.
     **/
    int videoFps() const;

    QComboBox       *m_preset = nullptr;      ///< Preset (item text = ConfigurationName).
    QLineEdit       *m_audio = nullptr;       ///< Audio file path.
    QLabel          *m_audioInfo = nullptr;   ///< Length, format, frames and size limit of the audio file.
    QComboBox       *m_res = nullptr;         ///< Full HD or 4K (item data = "WxH").
    QComboBox       *m_fps = nullptr;         ///< 24, 30, 60 or 120 (item data = the number).
    QComboBox       *m_codec = nullptr;       ///< auto, h264, hevc, av1 (item data = the -j word).
    QComboBox       *m_quality = nullptr;     ///< max, high, compact (item data = the -j q= word).
    QCheckBox       *m_fade = nullptr;        ///< Fade in and out.
    QCheckBox       *m_title = nullptr;       ///< Title reveal from the tags.
    QCheckBox       *m_blur = nullptr;        ///< Motion blur.
    QLineEdit       *m_output = nullptr;      ///< Output .mp4 path.
    QLabel          *m_ffmpegLabel = nullptr; ///< Which ffmpeg will run.
    QPushButton     *m_start = nullptr;       ///< "Create video" / "Cancel".
    QPushButton     *m_play = nullptr;        ///< Opens the finished video in the default player.
    QPushButton     *m_showDir = nullptr;     ///< Shows the finished video in Explorer.
    QProgressBar    *m_progress = nullptr;    ///< Frames done of all frames.
    QLabel          *m_status = nullptr;      ///< Phase, speed and time left; the result at the end.
    QPlainTextEdit  *m_log = nullptr;         ///< The engine's "[export]" lines and anything that looks like an error.
    QList<QWidget *> m_inputs;                ///< Everything that is locked while an export runs.

    QString       m_root;                 ///< findRootDir().
    QString       m_engine;               ///< findEngine().
    QString       m_ffmpeg;               ///< The ffmpeg to use (a path; empty if none was found).
    bool          m_ffmpegPicked = false; ///< The user chose m_ffmpeg (remembered); otherwise the newest found.
    QString       m_audioSet;             ///< The audio path last made the source (setAudio()).
    QString       m_outDir;               ///< A folder picked for the videos; empty = beside each audio file.
    double        m_audioSecs = 0.0;      ///< Length of the audio file (ffprobe), 0 if unknown.
    QProcess     *m_proc = nullptr;       ///< The running Kaleidoscope.exe, or null.
    QByteArray    m_pending;              ///< Unterminated tail of its stderr.
    QStringList   m_tail;                 ///< Its last 300 stderr lines, for the log after a failure.
    QString       m_error;                ///< The "[export] error" text, if one came.
    QString       m_outFile;              ///< The output of the running/last export.
    QElapsedTimer m_runClock;             ///< Wall time of the running export.
    bool          m_cancelling = false;   ///< A cancel was sent.
    QString       m_shots;                ///< scripted(): picture path prefix; empty in normal use.
    bool          m_shotRunning = false;  ///< scripted(): the "_running" picture has been taken.
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    ExportWindow( const ExportWindow & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    ExportWindow &operator=( const ExportWindow & ) = delete;
};
