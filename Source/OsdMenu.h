/**
 * @file OsdMenu.h
 * @brief On-screen menu for remote-control operation (HTPC IR remote): a tree
 *        of submenus, actions, switches, choices and sliders, driven by the
 *        arrow keys, OK, Back and Esc, drawn with QPainter over the output.
 */
#pragma once

#include <QString>
#include <QStringList>
#include <QElapsedTimer>
#include <functional>
#include <vector>

class QPainter;

/**
 * @brief One row of the on-screen menu.
 *
 * Every row reads and writes its state through callbacks, so the menu never
 * keeps a copy of anything: the keyboard shortcuts, the web remote and the
 * menu all change the same members and always show the same values.
 */
struct OsdItem
{
	/** @brief What a row does. */
	enum Kind
	{
		Submenu,   ///< opens #children (built fresh every time it is entered)
		Action,    ///< runs #action
		Toggle,    ///< on/off via #getB / #setB
		Choice,    ///< one of #options via #getI / #setI
		Slider     ///< a number in [#lo, #hi] via #getF / #setF, #step per press
	};

	Kind    kind = Action;   ///< Row type.
	QString label;           ///< Text shown on the left.

	std::function<std::vector<OsdItem>()> children;   ///< Submenu: builds the rows of the level it opens.
	std::function<void()>                  action;    ///< Action: what OK does.
	std::function<bool()>                  checked;   ///< Optional marker (current preset / audio source).
	bool    closeAfter = false;   ///< Action: close the whole menu after running (e.g. a preset, so its picture shows).
	QString doneText;             ///< Action: short confirmation shown in the hint line afterwards (empty = none).

	std::function<bool()>     getB;    ///< Toggle: current state.
	std::function<void(bool)> setB;    ///< Toggle: new state.

	std::function<int()>      getI;    ///< Choice: current index into #options.
	std::function<void(int)>  setI;    ///< Choice: new index.
	QStringList               options; ///< Choice: labels, in index order.

	std::function<float()>      getF;  ///< Slider: current value.
	std::function<void(float)>  setF;  ///< Slider: new value (the callee clamps).
	float lo = 0.f, hi = 1.f, step = 0.1f;   ///< Slider: range and increment per key press.
	std::function<QString(float)> fmt; ///< Slider: value text (default: one decimal).
};

/**
 * @brief The menu itself: a stack of levels, key handling and drawing.
 *
 * Remote keys: Up/Down select; OK (Enter) opens a submenu, runs an action or
 * switches a toggle / advances a choice; Right does the same for submenus and
 * raises choices and sliders; Left lowers choices and sliders, flips toggles,
 * and on any other row goes back; Back (Back/Backspace) goes one level up and
 * closes at the top; Esc and the Menu key close the menu. It hides itself
 * after a while without input.
 */
class OsdMenu
{
public:
	/**
	 * @brief Opens the menu on a fresh level.
	 * @param title Heading of the level (the breadcrumb root).
	 * @param build Builds its rows.
	 */
	void open( const QString &title, std::function<std::vector<OsdItem>()> build );
	void close();                                   ///< @brief Closes every level.
	bool isOpen() const { return !m_stack.empty(); } ///< @brief Whether any level is shown.

	/**
	 * @brief Feeds one key into the menu.
	 * @param key Qt key code.
	 * @return true if consumed -- while open the menu is modal and consumes every key.
	 */
	bool handleKey( int key );

	/** @brief Rebuilds every open level and its heading (after a language change), keeping the cursors. */
	void rebuildAll();

	/**
	 * @brief Asks for rebuildAll() at the next draw.
	 *
	 * For callbacks that change what the rows say (the language switch): they
	 * run inside a row of the level they would rebuild, so rebuilding right
	 * there would destroy the callback while it executes.
	 */
	void requestRebuild() { m_rebuildPending = true; }

	/** @brief Sets how the root heading is produced, so it follows a language change. */
	void setRootTitle( std::function<QString()> fn ) { m_rootTitle = std::move( fn ); }

	/**
	 * @brief Draws the open menu; also closes it after the idle timeout.
	 * @param p Painter on the output widget.
	 * @param w Widget width in pixels.
	 * @param h Widget height in pixels.
	 */
	void draw( QPainter *p, int w, int h );

	/** @brief Seconds without input after which the menu closes by itself. */
	static constexpr int kIdleCloseSec = 20;

private:
	/** @brief One open level of the menu. */
	struct Level
	{
		QString title;                                     ///< Heading.
		std::function<std::vector<OsdItem>()> build;       ///< Rebuilds #items.
		std::vector<OsdItem> items;                        ///< Current rows.
		int cursor = 0;                                    ///< Highlighted row.
		int top    = 0;                                    ///< First visible row.
	};

	void push( const QString &title, std::function<std::vector<OsdItem>()> build );
	void back();
	void activate( OsdItem &it );
	void adjust( OsdItem &it, int dir );
	void touch() { m_idle.restart(); }
	void flash( const QString &text ) { m_flashText = text; m_flash.restart(); }
	QString valueText( const OsdItem &it ) const;

	std::vector<Level> m_stack;     ///< Open levels, root first.
	QElapsedTimer      m_idle;      ///< Time since the last key.
	QElapsedTimer      m_flash;     ///< Time since the last confirmation text.
	QString            m_flashText; ///< Confirmation shown in the hint line for a moment.
	bool               m_rebuildPending = false;   ///< rebuildAll() due at the next draw.
	std::function<QString()> m_rootTitle;          ///< Root heading, re-read on rebuild.
};
