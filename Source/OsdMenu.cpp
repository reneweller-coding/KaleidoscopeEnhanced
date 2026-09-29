/**
 * @file OsdMenu.cpp
 * @brief Implementation of OsdMenu: key handling and the 10-foot drawing.
 */
#include "OsdMenu.h"
#include "Strings.h"

#include <QPainter>
#include <QFont>
#include <QFontMetrics>
#include <Qt>
#include <algorithm>
#include <cmath>

void OsdMenu::open( const QString &title, std::function<std::vector<OsdItem>()> build )
{
	m_stack.clear();
	m_flashText.clear();
	push( title, std::move( build ) );
}

void OsdMenu::close()
{
	m_stack.clear();
}

void OsdMenu::push( const QString &title, std::function<std::vector<OsdItem>()> build )
{
	Level lv;
	lv.title = title;
	lv.build = std::move( build );
	lv.items = lv.build ? lv.build() : std::vector<OsdItem>();
	// Open on the marked row (the running preset, the current audio source),
	// so OK straight away changes nothing.
	for( int i = 0; i < int( lv.items.size() ); ++i )
		if( lv.items[i].checked && lv.items[i].checked() ) { lv.cursor = i; break; }
	m_stack.push_back( std::move( lv ) );
	touch();
}

void OsdMenu::back()
{
	if( !m_stack.empty() )
		m_stack.pop_back();
	// The level below may show values the one just left has changed (e.g. the
	// language); rebuilding keeps its labels current.
	if( !m_stack.empty() )
	{
		Level &lv = m_stack.back();
		if( lv.build ) lv.items = lv.build();
		lv.cursor = std::min( lv.cursor, std::max( 0, int( lv.items.size() ) - 1 ) );
	}
}

void OsdMenu::rebuildAll()
{
	for( size_t k = 0; k < m_stack.size(); ++k )
	{
		Level &lv = m_stack[k];
		if( lv.build ) lv.items = lv.build();
		lv.cursor = std::min( lv.cursor, std::max( 0, int( lv.items.size() ) - 1 ) );
		// Headings follow too: the root from its title function, every other
		// level from the row that opened it.
		if( k == 0 && m_rootTitle )
			lv.title = m_rootTitle();
		else if( k > 0 )
		{
			const Level &up = m_stack[k - 1];
			if( up.cursor >= 0 && up.cursor < int( up.items.size() ) )
				lv.title = up.items[up.cursor].label;
		}
	}
}

void OsdMenu::activate( OsdItem &it )
{
	switch( it.kind )
	{
		case OsdItem::Submenu:
			push( it.label, it.children );
			break;
		case OsdItem::Action:
		{
			const bool    closeIt = it.closeAfter;
			const QString done    = it.doneText;
			if( it.action ) it.action();   // may rebuild levels: `it` is dead after this
			if( closeIt )            close();
			else if( !done.isEmpty() ) flash( done );
			break;
		}
		case OsdItem::Toggle:
			if( it.getB && it.setB ) it.setB( !it.getB() );
			break;
		case OsdItem::Choice:
			adjust( it, +1 );
			break;
		case OsdItem::Slider:
			break;   // sliders move with Left/Right only
	}
}

void OsdMenu::adjust( OsdItem &it, int dir )
{
	if( it.kind == OsdItem::Choice && it.getI && it.setI && !it.options.isEmpty() )
	{
		const int n = it.options.size();
		it.setI( ( it.getI() + dir + n ) % n );
	}
	else if( it.kind == OsdItem::Slider && it.getF && it.setF )
	{
		const float v = std::clamp( it.getF() + dir * it.step, it.lo, it.hi );
		// Snap to the step grid, so repeated presses land on round values.
		it.setF( std::round( v / it.step ) * it.step );
	}
	else if( it.kind == OsdItem::Toggle && it.getB && it.setB )
		it.setB( !it.getB() );
}

bool OsdMenu::handleKey( int key )
{
	if( m_stack.empty() )
		return false;
	touch();
	Level &lv = m_stack.back();
	const int n = int( lv.items.size() );

	switch( key )
	{
		case Qt::Key_Up:
			if( n > 0 ) lv.cursor = ( lv.cursor - 1 + n ) % n;
			return true;
		case Qt::Key_Down:
			if( n > 0 ) lv.cursor = ( lv.cursor + 1 ) % n;
			return true;
		case Qt::Key_PageUp:   lv.cursor = std::max( 0, lv.cursor - 8 );     return true;
		case Qt::Key_PageDown: lv.cursor = std::min( n - 1, lv.cursor + 8 ); return true;
		case Qt::Key_Home:     lv.cursor = 0;                                return true;
		case Qt::Key_End:      lv.cursor = std::max( 0, n - 1 );             return true;

		case Qt::Key_Return:
		case Qt::Key_Enter:
		case Qt::Key_Select:
			if( n > 0 ) activate( lv.items[lv.cursor] );
			return true;

		case Qt::Key_Right:
			if( n > 0 )
			{
				OsdItem &it = lv.items[lv.cursor];
				if( it.kind == OsdItem::Submenu ) activate( it );
				else                              adjust( it, +1 );
			}
			return true;

		case Qt::Key_Left:
			if( n > 0 )
			{
				OsdItem &it = lv.items[lv.cursor];
				if( it.kind == OsdItem::Choice || it.kind == OsdItem::Slider || it.kind == OsdItem::Toggle )
					adjust( it, -1 );
				else if( m_stack.size() > 1 )
					back();
			}
			return true;

		case Qt::Key_Back:        // remote "Back" (VK_BROWSER_BACK)
		case Qt::Key_Backspace:   // remotes that send Backspace for Back
			back();
			return true;

		case Qt::Key_Escape:
		case Qt::Key_Menu:
			close();
			return true;

		default:
			return true;          // modal: nothing leaks out of an open menu
	}
}

QString OsdMenu::valueText( const OsdItem &it ) const
{
	switch( it.kind )
	{
		case OsdItem::Toggle:
			return QString::fromUtf8( Strings::T( ( it.getB && it.getB() ) ? S_ON : S_OFF ) );
		case OsdItem::Choice:
		{
			const int i = it.getI ? it.getI() : 0;
			return ( i >= 0 && i < it.options.size() ) ? QString::fromUtf8( "‹ %1 ›" ).arg( it.options[i] ) : QString();
		}
		case OsdItem::Slider:
		{
			const float v = it.getF ? it.getF() : 0.f;
			return it.fmt ? it.fmt( v ) : QString::number( double( v ), 'f', 1 );
		}
		case OsdItem::Submenu:
			return QString::fromUtf8( "›" );
		default:
			return QString();
	}
}

void OsdMenu::draw( QPainter *p, int w, int h )
{
	if( m_stack.empty() )
		return;
	if( m_idle.isValid() && m_idle.elapsed() > kIdleCloseSec * 1000 )
	{
		close();
		return;
	}
	if( m_rebuildPending )
	{
		m_rebuildPending = false;
		rebuildAll();
	}
	Level &lv = m_stack.back();
	const int n = int( lv.items.size() );

	// 10-foot sizing: everything scales with the output height, so the menu
	// reads from the sofa on a 4K TV as well as in a 720p window.
	const int   rowH  = std::max( 26, h / 18 );
	const int   fontPx = std::max( 14, int( rowH * 0.52 ) );
	const int   pad   = rowH / 2;
	const int   boxW  = std::min( w - 2 * pad, std::max( int( w * 0.42 ), rowH * 14 ) );
	const int   maxRows = std::max( 3, int( ( h * 0.78 ) / rowH ) - 3 );
	const int   visible = std::min( n, maxRows );
	lv.cursor = std::clamp( lv.cursor, 0, std::max( 0, n - 1 ) );
	if( lv.cursor < lv.top ) lv.top = lv.cursor;
	if( lv.cursor >= lv.top + visible ) lv.top = lv.cursor - visible + 1;
	lv.top = std::clamp( lv.top, 0, std::max( 0, n - visible ) );

	const int boxH = rowH * ( std::max( visible, 1 ) + 2 ) + pad * 2;
	const int x0 = ( w - boxW ) / 2;
	const int y0 = ( h - boxH ) / 2;

	p->save();
	p->setRenderHint( QPainter::Antialiasing, true );
	p->setPen( Qt::NoPen );
	p->setBrush( QColor( 8, 10, 18, 215 ) );
	p->drawRoundedRect( x0, y0, boxW, boxH, rowH * 0.35, rowH * 0.35 );

	// Breadcrumb heading: "MENÜ › Feintuning".
	QStringList crumbs;
	for( const Level &l : m_stack ) crumbs << l.title;
	QFont hf( "Segoe UI", -1, QFont::DemiBold );
	hf.setPixelSize( int( fontPx * 1.05 ) );
	p->setFont( hf );
	p->setPen( QColor( 120, 200, 255 ) );
	const QRect head( x0 + pad, y0 + pad, boxW - 2 * pad, rowH );
	p->drawText( head, Qt::AlignLeft | Qt::AlignVCenter,
	             QFontMetrics( hf ).elidedText( crumbs.join( QString::fromUtf8( "  ›  " ) ), Qt::ElideLeft, head.width() ) );

	QFont f( "Segoe UI" );
	f.setPixelSize( fontPx );
	p->setFont( f );
	const QFontMetrics fm( f );
	for( int r = 0; r < visible; ++r )
	{
		const int i = lv.top + r;
		const OsdItem &it = lv.items[i];
		const QRect row( x0 + pad / 2, y0 + pad + rowH * ( r + 1 ), boxW - pad, rowH );
		if( i == lv.cursor )
		{
			p->setPen( Qt::NoPen );
			p->setBrush( QColor( 60, 130, 220, 170 ) );
			p->drawRoundedRect( row.adjusted( 0, 2, 0, -2 ), rowH * 0.2, rowH * 0.2 );
		}
		const QRect txt = row.adjusted( pad / 2 + rowH / 2, 0, -pad / 2, 0 );
		// Marker for the current preset / audio source.
		if( it.checked && it.checked() )
		{
			p->setPen( Qt::NoPen );
			p->setBrush( QColor( 150, 230, 150 ) );
			const int d = rowH / 4;
			p->drawEllipse( row.left() + pad / 2 - d / 4, row.center().y() - d / 2, d, d );
		}
		const QString val = valueText( it );
		const int valW = val.isEmpty() ? 0 : fm.horizontalAdvance( val ) + pad;
		p->setPen( i == lv.cursor ? QColor( 255, 255, 255 ) : QColor( 215, 222, 235 ) );
		p->drawText( txt.adjusted( 0, 0, -valW, 0 ), Qt::AlignLeft | Qt::AlignVCenter,
		             fm.elidedText( it.label, Qt::ElideRight, txt.width() - valW ) );
		if( !val.isEmpty() )
		{
			QColor vc( 150, 230, 150 );
			if( it.kind == OsdItem::Toggle && !( it.getB && it.getB() ) ) vc = QColor( 150, 150, 160 );
			if( it.kind == OsdItem::Submenu ) vc = QColor( 150, 170, 200 );
			p->setPen( vc );
			p->drawText( txt, Qt::AlignRight | Qt::AlignVCenter, val );
		}
		// Sliders: a thin bar under the row showing where the value sits.
		if( it.kind == OsdItem::Slider && it.getF && it.hi > it.lo )
		{
			const float t = std::clamp( ( it.getF() - it.lo ) / ( it.hi - it.lo ), 0.f, 1.f );
			const int bx = txt.left(), bw = txt.width(), by = row.bottom() - rowH / 7;
			p->setPen( Qt::NoPen );
			p->setBrush( QColor( 255, 255, 255, 40 ) );
			p->drawRect( bx, by, bw, 3 );
			p->setBrush( QColor( 120, 200, 255 ) );
			p->drawRect( bx, by, int( bw * t ), 3 );
		}
	}
	// Scroll hints.
	p->setPen( QColor( 150, 170, 200 ) );
	if( lv.top > 0 )
		p->drawText( QRect( x0, y0 + pad + rowH / 2, boxW - pad, rowH / 2 ), Qt::AlignRight | Qt::AlignVCenter, QString::fromUtf8( "▲" ) );
	if( lv.top + visible < n )
		p->drawText( QRect( x0, y0 + pad + rowH * ( visible + 1 ), boxW - pad, rowH / 2 ), Qt::AlignRight | Qt::AlignVCenter, QString::fromUtf8( "▼" ) );

	// Hint line, or the confirmation of the last action for a moment.
	QFont sf( "Segoe UI" );
	sf.setPixelSize( std::max( 12, int( fontPx * 0.72 ) ) );
	p->setFont( sf );
	const QRect hint( x0 + pad, y0 + pad + rowH * ( visible + 1 ), boxW - 2 * pad, rowH );
	const bool flashing = !m_flashText.isEmpty() && m_flash.isValid() && m_flash.elapsed() < 2500;
	p->setPen( flashing ? QColor( 150, 230, 150 ) : QColor( 150, 160, 180 ) );
	p->drawText( hint, Qt::AlignLeft | Qt::AlignVCenter,
	             flashing ? m_flashText : QString::fromUtf8( Strings::T( S_OSD_HINT ) ) );
	p->restore();
}
