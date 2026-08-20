/**
 * @file VideoPiP.h
 * @brief A second, independent Qt6Multimedia video decoder for the music-video picture-in-picture overlay (see TrackMedia's video cache) -- deliberately separate from VideoIn's single global instance, since that one REPLACES the photo source, while this one plays ALONGSIDE it in a screen corner.
 */
#ifndef VIDEOPIP_H
#define VIDEOPIP_H

// Music-video picture-in-picture: same decode-to-GL-texture shape as
// VideoIn (see that file's header for the rationale), plus SEEKING, which
// VideoIn never needed -- a PiP has to track the actual song's playback
// position (from NowPlaying), not just play a file start-to-finish.
// -----------------------------------------------------------------------

/**
 * @brief Starts (or, for an already-open path, is a no-op for) playback of a single local video file.
 * @param path Path to the video file to play, looped.
 * @return true if playback was started (or was already running on this exact path); false if the file can't be opened.
 */
bool videoPipLoad( const char *path );

/**
 * @brief Seeks the PiP video to an absolute position, if it differs from the current one by more than a small tolerance.
 *
 * Cheap to call every frame: a no-op unless the drift actually exceeds the tolerance, so the
 * caller doesn't need its own throttling logic.
 * @param ms Target position in milliseconds.
 * @param toleranceMs Only seek if the current position differs from @p ms by more than this.
 */
void videoPipSeek( long long ms, long long toleranceMs );

/** @brief Pauses or resumes the PiP video (mirrors the song's own play/pause state). */
void videoPipSetPlaying( bool playing );

/**
 * @brief The newest decoded video frame as a GL texture, uploading it lazily on first access after it arrives.
 * @param width Receives the frame width in pixels (only written once a texture exists).
 * @param height Receives the frame height in pixels (only written once a texture exists).
 * @return The GL texture id holding the latest decoded frame, or 0 if no frame has been decoded yet.
 */
unsigned int videoPipFrame( unsigned int *width, unsigned int *height );

/**
 * @brief Stops playback, destroys the player/sink/audio-output and the GL texture, and resets all state.
 */
void videoPipRelease();

#endif
