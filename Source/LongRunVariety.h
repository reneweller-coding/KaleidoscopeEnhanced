//---------------------------------------------------------------------------
//                              LongRunVariety
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  What keeps a preset fresh over hours and days: the scheduler's memory of the scenes it showed, the chain labs'
 *  share of the screen time, and how new a chain class is to the viewer.
 *
 *  A preset holds some 400 hand-made scenes; at the usual pace of one change a minute each of them came back two or
 *  three times a day, a tenth of them within the hour.  The chain labs (ChainLab2D, ChainLab3D, ChainLabTunnel,
 *  ChainSlice3D) never run out -- millions of chains, thousands of 3D worlds -- but they were one entry among the
 *  400 and got about one percent of the time.  Three things change that, all of them small enough to check without
 *  a window (`Kaleidoscope.exe -q`):
 *
 *  - RecentScenes: the scenes of the last three quarters of the preset are not picked again, and the list
 *    survives a restart (RenderPipeline keeps it in the settings file, per preset).
 *  - LabShareClock: a preset may ask for a share of the screen time for its walking labs (`labShare="0.35"`); the
 *    clock tells the scheduler when the next pick is a lab.  Never two labs in a row: a lab walks for minutes, the
 *    hand-made scenes come in between.
 *  - classNovelty(): a lab's walk weighs its candidate classes by how long ago the viewer saw them, so over days
 *    all classes come round instead of the music's favourite few.
 *
 *  @author René Weller
 */

#ifndef LONGRUNVARIETY_H
#define LONGRUNVARIETY_H

#include <cmath>
#include <cstddef>
#include <deque>
#include <string>
#include <unordered_map>
#include <vector>

/** @class RecentScenes
 *
 * The scenes shown most recently, by shader file name, oldest first: the scheduler's no-repeat memory.
 *
 * A name, not an entry index: a mesh family registers one entry per model, and "the same scene with another ship"
 * is still the same scene.  The capacity is set from the preset (three quarters of its scenes); a name that comes
 * twice counts twice, so trimming the older copy keeps the newer one in.
 **/
class RecentScenes
{
public:
    /** Default construction, which the declared copy operations would otherwise suppress: empty, capacity 40. */
    RecentScenes() = default;
    /**  Sets how many scenes the memory holds; the oldest beyond it are dropped.
     *
     * @param n  Capacity in scenes. (in)
     **/
    void setCapacity( size_t n )
    {
        m_cap = n;
        trim();
    }
    /**  How many scenes the memory holds at most.
     *
     * @return
     *   The capacity.
     **/
    size_t capacity() const { return m_cap; }
    /**  How many scenes the memory holds now.
     *
     * @return
     *   The number of names.
     **/
    size_t size() const { return m_names.size(); }
    /**  Whether a scene is in the memory.
     *
     * @param name  Shader file name ("Voyager.frag"). (in)
     *
     * @return
     *   True if it was shown within the memory's span.
     **/
    bool contains( const std::string &name ) const
    {
        auto it = m_count.find( name );
        return it != m_count.end() && it->second > 0;
    }
    /**  Whether a scene is among the last few shown.
     *
     * @param name  Shader file name. (in)
     * @param last  How many of the most recent entries count. (in)
     *
     * @return
     *   True if it is one of the last @p last names.
     **/
    bool containsLast( const std::string &name, size_t last ) const
    {
        size_t n = 0;
        for ( auto it = m_names.rbegin(); it != m_names.rend() && n < last; ++it, ++n )
            if ( *it == name )
                return true;
        return false;
    }
    /**  Notes a scene that has just come on screen.
     *
     * @param name  Shader file name. (in)
     **/
    void push( const std::string &name )
    {
        m_names.push_back( name );
        ++m_count[name];
        trim();
    }
    /**  Replaces the memory with a stored list (oldest first), trimmed to the capacity from the old end.
     *
     * @param names  The stored names. (in)
     **/
    void assign( const std::vector<std::string> &names )
    {
        m_names.clear();
        m_count.clear();
        for ( const std::string &n : names )
            if ( !n.empty() )
                push( n );
    }
    /**  The memory, oldest first (what RenderPipeline stores).
     *
     * @return
     *   The names.
     **/
    std::vector<std::string> names() const { return std::vector<std::string>( m_names.begin(), m_names.end() ); }

private:
    /** Drops the oldest names beyond the capacity. */
    void trim()
    {
        while ( m_names.size() > m_cap )
        {
            auto it = m_count.find( m_names.front() );
            if ( it != m_count.end() && --it->second <= 0 )
                m_count.erase( it );
            m_names.pop_front();
        }
    }

    std::deque<std::string>              m_names;    ///< The names, oldest first.
    std::unordered_map<std::string, int> m_count;    ///< How often each name is in m_names.
    size_t                               m_cap = 40; ///< Capacity in scenes.
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    RecentScenes( const RecentScenes & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    RecentScenes &operator=( const RecentScenes & ) = delete;
};

/** @class LabShareClock
 *
 * The walking chain labs' share of the screen time, against the share the preset asks for.
 *
 * Both totals decay with a time constant of three hours, so the share follows the last few hours rather than the
 * whole evening: a lab skipped by hand early on is not made up for at two in the morning.
 **/
class LabShareClock
{
public:
    /** Default construction, which the declared copy operations would otherwise suppress: no share asked for. */
    LabShareClock() = default;
    /**  Sets the share the preset asks for.
     *
     * @param share  Share of the screen time, 0..1 (0: the labs are scenes like any other). (in)
     **/
    void setTarget( float share ) { m_target = share < 0.f ? 0.f : ( share > 1.f ? 1.f : share ); }
    /**  The share the preset asks for.
     *
     * @return
     *   The target share, 0..1.
     **/
    float target() const { return m_target; }
    /**  How long a lab stays, on average.
     *
     * @param secs  Seconds of one lab stay (the lab entries' mean solo time); 0 decides at the share itself. (in)
     *
     * A lab is one big step of screen time.  Called the moment the labs fall behind, each lab carried them past the
     * share, and they stayed ahead: +0.2 to +1.8 points in the genre presets (the scene plan run, Kaleidoscope.exe
     * --schedule, 16.10.2026).  With the stay known, a lab is called once the labs are behind by 0.3 of the
     * overshoot one stay makes, and the share swings around the target instead of above it: 0.3 centred it within
     * 0.1 points in a simulation of this clock over labs of 120..900 s; half a stay, the obvious guess, fell short by
     * as much as the old rule overshot.
     **/
    void setLabStay( float secs ) { m_labStay = secs > 0.f ? secs : 0.f; }
    /**  Books screen time.
     *
     * @param secs  Seconds a scene was on screen. (in)
     * @param lab   Whether it was a walking lab. (in)
     *
     * @sideeffects
     *   Decays both totals by exp(-secs / 3 h) first.
     **/
    void add( float secs, bool lab )
    {
        if ( secs <= 0.f )
            return;
        const float k = std::exp( -secs / Tau );
        m_lab *= k;
        m_all *= k;
        m_all += secs;
        if ( lab )
            m_lab += secs;
    }
    /**  The labs' share of the screen time so far.
     *
     * @return
     *   The share, 0..1 (0 before any time was booked).
     **/
    float share() const { return m_all > 0.f ? m_lab / m_all : 0.f; }
    /**  Whether the next scene should be a walking lab.
     *
     * @param activeIsLab  The scene on screen now is a walking lab. (in)
     * @param roll         A uniform random number 0..1, used only before any time was booked. (in)
     *
     * @return
     *   True if the labs are behind their share by more than 0.3 of a stay's overshoot (setLabStay()), and the
     *   scene on screen is not one.
     **/
    bool wantLab( bool activeIsLab, float roll ) const
    {
        if ( m_target <= 0.f )
            return false;
        if ( m_target >= 1.f )
            return true;
        if ( activeIsLab )
            return false;
        if ( m_all < 1.f )
            return roll < m_target;
        return m_lab + ( 1.f - m_target ) * 0.3f * m_labStay < m_target * m_all;
    }

private:
    static constexpr float Tau = 3.f * 3600.f; ///< Time constant of the decay (seconds).
    float                  m_target = 0.f;     ///< The share the preset asks for.
    float                  m_lab = 0.f;        ///< Decayed seconds of walking labs.
    float                  m_all = 0.f;        ///< Decayed seconds of everything.
    float                  m_labStay = 0.f;    ///< Seconds of one lab stay on average (setLabStay()).
private:
    /** Not copyable (CGVR template: copy constructor and assignment are always declared). */
    LabShareClock( const LabShareClock & ) = delete;
    /**  Not assignable; see the copy constructor.
     *
     * @return
     *   Nothing: the operator is deleted, so no call compiles.
     **/
    LabShareClock &operator=( const LabShareClock & ) = delete;
};

/**  How new a chain class is to the viewer: the weight a lab's walk gives a candidate class.
 *
 * @param ageSecs  Seconds since the class was last on screen; negative: never. (in)
 *
 * @return
 *   0.2 for a class on screen right now, rising linearly to 1 after six hours (and for one never seen).
 *
 * The walk draws a few candidate classes and picks one by these weights times the learnt taste (classTaste), so
 * a class just seen is five times less likely than a fresh one -- less likely, never impossible, and the music
 * still picks the region of the class list.
 **/
inline float classNovelty( double ageSecs )
{
    const double Span = 6.0 * 3600.0;
    if ( ageSecs < 0.0 || ageSecs >= Span )
        return 1.f;
    return static_cast<float>( 0.2 + 0.8 * ageSecs / Span );
}

/**  Maps a walk target on the whole class list (0..1) into the range a preset entry allows for that stage.
 *
 * @param t   The target the walk drew, 0..1 (values outside are clamped). (in)
 * @param lo  The lower end of the entry's knob range. (in)
 * @param hi  The upper end. (in)
 *
 * @return
 *   The target in [lo, hi], and never past 0.999 (the last class).
 *
 * The classes are sorted by energy, so a range is a region of calm or wild classes: an Ambient entry with
 * chainAP 0..0.6 walks only the calmer three fifths of stage A, whatever the music.
 **/
inline float walkTarget( float t, float lo, float hi )
{
    t = t < 0.f ? 0.f : ( t > 1.f ? 1.f : t );
    float v = lo + ( hi - lo ) * t;
    return v < 0.f ? 0.f : ( v > 0.999f ? 0.999f : v );
}

#endif // LONGRUNVARIETY_H
