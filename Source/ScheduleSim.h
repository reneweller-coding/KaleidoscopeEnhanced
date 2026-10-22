/*****************************************************************************\
 *                              ScheduleSim.h
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Kaleidoscope.exe --schedule: the scene plan of a long run, computed by the real scheduler without a window.
 *
 *      Kaleidoscope.exe --schedule <preset> <audio.wav|silence> <hours> <out.tsv> [--fps N] [--cues file]
 *
 *  Tools/long_run_sim.py modelled the scheduler in Python ("a model, not the app": no music, no complexity budget),
 *  and every change to SceneScheduler had to be repeated there by hand.  This run takes the code itself: it loads
 *  the preset without a GL context (Configuration builds the entries GL-free), and drives
 *  RenderPipeline::simulateFrame() -- the mood, the timing scale, the AudioConditioner, SceneScheduler::tick() and
 *  tickFx(), the chain labs' walk decision -- on the virtual EngineClock at 60 frames a second, from the analysis of
 *  a 16-bit WAV (looped; every loop counts as the same song played again) or of silence.  A day of silence takes
 *  some seconds.  `--cues` adds the generator's score cues for the WAV (the app's -k; CueReceiver.h), handed over on
 *  the WAV's clock and again with every loop.
 *
 *  The output is one line per completed change -- scene fades and combine fades -- with the reason, the planned and
 *  the actual times and the transition; the head lists the entries with their ranges.  Tools/check_schedule.py
 *  checks the standing rules against it (solo times inside the entry's range, never two labs in a row, the lab
 *  share, the fade floors), Tools/long_run_sim.py --real computes its statistics from it.
 *
 *  Neutral where the app is personal: no taste, no ban, no scene memory from the settings file, no settings at all
 *  (calm motion, reactivity: defaults).  Left out: the transport (freeze, DJ stop), the mesh warm-up hold (no model
 *  loads; a fade starts at once) and everything that draws.  KALEIDO_SEED sets the seed (default 1) -- and, as in
 *  any seeded run of the app, gives every scene activation its own stream (EffectShader::resetParameters()).
 *
 *  @author René Weller
 */
#ifndef SCHEDULESIM_H
#define SCHEDULESIM_H

/**  Runs the scene plan (see the file comment) and writes its TSV.
 *
 * @param argc  Number of arguments after "--schedule". (in)
 * @param argv  The arguments after "--schedule": preset, audio, hours, output file, optionally --fps N and
 *              --cues file. (in)
 *
 * @return
 *   0 done, 2 on a usage error or an unreadable preset or audio file.  Needs a QCoreApplication.
 **/
int runScheduleSim( int argc, char **argv );

#endif // SCHEDULESIM_H
