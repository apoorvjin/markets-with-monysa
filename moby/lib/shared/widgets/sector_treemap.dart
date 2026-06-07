import 'package:flutter/material.dart';
import '../../data/models/treemap_stock.dart';
import '../../core/theme/app_palette.dart';
import 'sparkline_chart.dart';

class SectorTreemap extends StatefulWidget {
  final List<TreemapStock> stocks;
  /// Fires when a sector header is tapped. When null, sector headers are not
  /// tappable (used by the already-focused sector view to avoid recursive drill-in).
  final void Function(String sector)? onSectorTap;
  const SectorTreemap({super.key, required this.stocks, this.onSectorTap});

  @override
  State<SectorTreemap> createState() => _SectorTreemapState();
}

class _SectorTreemapState extends State<SectorTreemap> {
  OverlayEntry? _overlayEntry;

  @override
  void dispose() {
    _hideTooltip();
    super.dispose();
  }

  void _hideTooltip() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  void _showTooltipAt(TreemapStock stock, Offset globalPosition) {
    _hideTooltip();
    final overlay = Overlay.of(context);
    final screen = MediaQuery.of(context).size;
    final insets = MediaQuery.of(context).padding;
    const cardWidth = 260.0;
    // Tooltip height grows with optional fields (sparkline, day-range, 52w
    // bar, pre/post pill). 280 keeps the placement math reasonable for the
    // common case where most of those are present.
    const estCardHeight = 280.0;
    const gap = 12.0;
    const margin = 10.0;

    // Prefer placing the card above the tap; fall back below when there isn't
    // enough vertical room above (e.g. tile near the top of the viewport).
    double top = globalPosition.dy - estCardHeight - gap;
    final minTop = insets.top + margin;
    final maxTop = screen.height - insets.bottom - estCardHeight - margin;
    if (top < minTop) top = globalPosition.dy + gap;
    if (top > maxTop) top = maxTop;
    if (top < minTop) top = minTop;

    // Horizontally centre on the tap, clamped to viewport edges.
    double left = globalPosition.dx - cardWidth / 2;
    final maxLeft = screen.width - cardWidth - margin;
    if (left < margin) left = margin;
    if (left > maxLeft) left = maxLeft;

    _overlayEntry = OverlayEntry(
      builder: (ctx) => Stack(
        children: [
          // Tap-anywhere catcher behind the card — dismisses on outside tap
          // without blocking the card itself.
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _hideTooltip,
              child: const SizedBox.expand(),
            ),
          ),
          Positioned(
            left: left,
            top: top,
            width: cardWidth,
            child: Material(
              color: Colors.transparent,
              child: _TooltipCard(stock: stock, onClose: _hideTooltip),
            ),
          ),
        ],
      ),
    );
    overlay.insert(_overlayEntry!);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        final layout = _computeLayout(widget.stocks, size);
        return Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            // Sector header labels first (drawn behind tiles). Header strip is
            // tappable when an `onSectorTap` callback is provided.
            for (final sector in layout.sectors)
              if (sector.rect.height >= 24 && sector.rect.width >= 60)
                Positioned.fromRect(
                  rect: sector.rect,
                  child: GestureDetector(
                    onTap: widget.onSectorTap == null
                        ? null
                        : () => widget.onSectorTap!(sector.name),
                    child: _SectorHeader(name: sector.name),
                  ),
                ),
            // Stock tiles on top.
            for (final tile in layout.tiles)
              Positioned.fromRect(
                rect: tile.rect,
                child: GestureDetector(
                  onTapUp: (details) =>
                      _showTooltipAt(tile.stock, details.globalPosition),
                  child: _StockTile(stock: tile.stock, rect: tile.rect),
                ),
              ),
            // Sector boundary outlines — drawn on top of tiles in the screen
            // background colour so sectors look visibly separated.
            for (final sector in layout.sectors)
              Positioned.fromRect(
                rect: sector.rect,
                child: IgnorePointer(
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(color: c.background, width: 2.5),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

// ── Color scale ───────────────────────────────────────────────────────────────

Color colorForChange(double pct) {
  if (pct.isNaN || pct.abs() < 0.05) return const Color(0xFF3F3F3F);
  if (pct > 0) {
    final t = (pct / 3.0).clamp(0.0, 1.0);
    return Color.lerp(const Color(0xFF1F4D32), const Color(0xFF0B6B35), t)!;
  } else {
    final t = (-pct / 3.0).clamp(0.0, 1.0);
    return Color.lerp(const Color(0xFF5C2026), const Color(0xFF8A1A1A), t)!;
  }
}

// ── Layout types ──────────────────────────────────────────────────────────────

class _TileLayout {
  final TreemapStock stock;
  final Rect rect;
  _TileLayout(this.stock, this.rect);
}

class _SectorLayout {
  final String name;
  final Rect rect;
  _SectorLayout(this.name, this.rect);
}

class _TreemapData {
  final List<_TileLayout> tiles;
  final List<_SectorLayout> sectors;
  _TreemapData(this.tiles, this.sectors);
}

// ── Squarified treemap (Bruls, Huijz, van Wijk 2000) ─────────────────────────

_TreemapData _computeLayout(List<TreemapStock> stocks, Size size) {
  if (stocks.isEmpty || size.width <= 0 || size.height <= 0) {
    return _TreemapData(const [], const []);
  }
  // Group by sector and total their market caps.
  final bySector = <String, List<TreemapStock>>{};
  for (final s in stocks) {
    (bySector[s.sector] ??= []).add(s);
  }
  final sectorEntries = bySector.entries.toList()
    ..sort((a, b) => _sumCap(b.value).compareTo(_sumCap(a.value)));

  // Lay out sectors across the full canvas.
  final sectorRects = _squarify<String>(
    sectorEntries.map((e) => _Item(e.key, _sumCap(e.value))).toList(),
    Offset.zero & size,
  );
  final sectors = <_SectorLayout>[];
  final tiles = <_TileLayout>[];

  for (final sr in sectorRects) {
    sectors.add(_SectorLayout(sr.id, sr.rect));
    final inside = bySector[sr.id]!..sort((a, b) => b.marketCap.compareTo(a.marketCap));
    // Reserve a small header strip so the sector name stays readable.
    final hasHeader = sr.rect.height >= 28 && sr.rect.width >= 80;
    final tilesRect = hasHeader
        ? Rect.fromLTWH(sr.rect.left, sr.rect.top + 18, sr.rect.width, sr.rect.height - 18)
        : sr.rect;
    final stockRects = _squarify<TreemapStock>(
      inside.map((s) => _Item(s, s.marketCap)).toList(),
      tilesRect,
    );
    for (final tr in stockRects) {
      tiles.add(_TileLayout(tr.id, tr.rect));
    }
  }
  return _TreemapData(tiles, sectors);
}

double _sumCap(List<TreemapStock> ss) => ss.fold<double>(0.0, (a, b) => a + b.marketCap);

class _Item<T> {
  final T id;
  final double value;
  _Item(this.id, this.value);
}

class _Placed<T> {
  final T id;
  final Rect rect;
  _Placed(this.id, this.rect);
}

List<_Placed<T>> _squarify<T>(List<_Item<T>> items, Rect rect) {
  if (items.isEmpty || rect.width <= 0 || rect.height <= 0) return [];
  final total = items.fold<double>(0.0, (a, b) => a + b.value);
  if (total <= 0) return [];
  // Normalize values to fill the rectangle area.
  final area = rect.width * rect.height;
  final scaled = items
      .map((i) => _Item<T>(i.id, i.value / total * area))
      .toList();

  final placed = <_Placed<T>>[];
  var remaining = rect;
  var row = <_Item<T>>[];
  var i = 0;

  while (i < scaled.length || row.isNotEmpty) {
    final w = _shortSide(remaining);
    if (i < scaled.length) {
      final next = scaled[i];
      final newRow = [...row, next];
      if (row.isEmpty || _worst(newRow, w) <= _worst(row, w)) {
        row = newRow;
        i++;
        continue;
      }
    }
    // Lay the current row, advance remaining.
    final laid = _layoutRow<T>(row, remaining);
    placed.addAll(laid.placements);
    remaining = laid.remaining;
    row = <_Item<T>>[];
    if (remaining.width <= 0 || remaining.height <= 0) break;
  }
  return placed;
}

double _shortSide(Rect r) => r.width < r.height ? r.width : r.height;

double _worst(List<_Item> row, double w) {
  if (row.isEmpty) return double.infinity;
  var sum = 0.0, mn = double.infinity, mx = 0.0;
  for (final r in row) {
    sum += r.value;
    if (r.value < mn) mn = r.value;
    if (r.value > mx) mx = r.value;
  }
  final s2 = sum * sum;
  final w2 = w * w;
  return [w2 * mx / s2, s2 / (w2 * mn)].reduce((a, b) => a > b ? a : b);
}

class _LayoutResult<T> {
  final List<_Placed<T>> placements;
  final Rect remaining;
  _LayoutResult(this.placements, this.remaining);
}

_LayoutResult<T> _layoutRow<T>(List<_Item<T>> row, Rect rect) {
  final sum = row.fold<double>(0.0, (a, b) => a + b.value);
  final placements = <_Placed<T>>[];
  if (rect.width < rect.height) {
    // Row spans horizontally, height = sum / width.
    final h = sum / rect.width;
    var x = rect.left;
    for (final it in row) {
      final w = it.value / h;
      placements.add(_Placed(it.id, Rect.fromLTWH(x, rect.top, w, h)));
      x += w;
    }
    return _LayoutResult(
      placements,
      Rect.fromLTWH(rect.left, rect.top + h, rect.width, rect.height - h),
    );
  } else {
    // Row spans vertically, width = sum / height.
    final w = sum / rect.height;
    var y = rect.top;
    for (final it in row) {
      final h = it.value / w;
      placements.add(_Placed(it.id, Rect.fromLTWH(rect.left, y, w, h)));
      y += h;
    }
    return _LayoutResult(
      placements,
      Rect.fromLTWH(rect.left + w, rect.top, rect.width - w, rect.height),
    );
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _SectorHeader extends StatelessWidget {
  final String name;
  const _SectorHeader({required this.name});

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.topLeft,
      padding: const EdgeInsets.fromLTRB(7, 5, 7, 0),
      color: Colors.black.withValues(alpha: 0.35),
      child: Text(
        name.toUpperCase(),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
          color: Color(0xFFCCCCCC),
        ),
      ),
    );
  }
}

class _StockTile extends StatelessWidget {
  final TreemapStock stock;
  final Rect rect;
  const _StockTile({required this.stock, required this.rect});

  @override
  Widget build(BuildContext context) {
    final color = colorForChange(stock.changePercent);
    // Only suppress text on slivers too thin for even a single readable glyph.
    final hasRoom = rect.width >= 14 && rect.height >= 10;
    // Stack %change under the symbol only when there's vertical room for both.
    final showChange = rect.height >= 30 && rect.width >= 36;
    return Container(
      decoration: BoxDecoration(
        color: color,
        border: Border.all(color: Colors.black.withValues(alpha: 0.45), width: 0.5),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 1),
      alignment: Alignment.center,
      child: hasRoom
          ? FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.center,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    stock.symbol,
                    maxLines: 1,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  if (showChange)
                    Text(
                      _fmtPct(stock.changePercent),
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.white.withValues(alpha: 0.85),
                      ),
                    ),
                ],
              ),
            )
          : null,
    );
  }
}

class _TooltipCard extends StatelessWidget {
  final TreemapStock stock;
  final VoidCallback onClose;
  const _TooltipCard({required this.stock, required this.onClose});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final up = stock.changePercent >= 0;
    final hasDayRange = stock.dayHigh != null && stock.dayLow != null;
    final has52w =
        stock.fiftyTwoWeekHigh != null && stock.fiftyTwoWeekLow != null;
    final hasSparkline =
        stock.sparkline != null && stock.sparkline!.length >= 2;
    final hasExtended = stock.preMarketPrice != null &&
            stock.preMarketChangePercent != null ||
        stock.postMarketPrice != null && stock.postMarketChangePercent != null;
    return GestureDetector(
      onTap: () {}, // absorb taps so background dismiss doesn't fire.
      child: Container(
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: c.textSecondary.withValues(alpha: 0.2)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.45),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        padding: const EdgeInsets.fromLTRB(14, 12, 10, 14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    stock.symbol,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: c.textPrimary,
                    ),
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: Icon(Icons.close_rounded,
                      size: 18, color: c.textSecondary),
                  onPressed: onClose,
                ),
              ],
            ),
            Text(
              stock.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, color: c.textSecondary),
            ),
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '\$${_fmtPrice(stock.price)}',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: c.textPrimary,
                  ),
                ),
                const SizedBox(width: 10),
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(
                    _fmtPct(stock.changePercent),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: up ? c.accent : c.danger,
                    ),
                  ),
                ),
                if (hasSparkline) ...[
                  const Spacer(),
                  SparklineChart(
                    data: stock.sparkline!,
                    width: 70,
                    height: 26,
                  ),
                ],
              ],
            ),
            if (hasExtended) ...[
              const SizedBox(height: 6),
              _extendedRow(c),
            ],
            const SizedBox(height: 12),
            if (hasDayRange) ...[
              _rangeRow(c, 'Day range', stock.dayLow!, stock.dayHigh!, stock.price),
              const SizedBox(height: 6),
            ],
            if (has52w) ...[
              _rangeRow(c, '52w range', stock.fiftyTwoWeekLow!,
                  stock.fiftyTwoWeekHigh!, stock.price),
              const SizedBox(height: 6),
            ],
            _row(c, 'Market cap', _fmtMarketCap(stock.marketCap)),
            const SizedBox(height: 6),
            _row(c, 'Sector', stock.sector),
          ],
        ),
      ),
    );
  }

  Widget _row(AppPalette c, String label, String value) {
    return Row(
      children: [
        Text(label, style: TextStyle(fontSize: 12, color: c.textSecondary)),
        const Spacer(),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: c.textPrimary,
          ),
        ),
      ],
    );
  }

  Widget _rangeRow(AppPalette c, String label, double lo, double hi, double price) {
    final t = (hi == lo) ? 0.5 : ((price - lo) / (hi - lo)).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label, style: TextStyle(fontSize: 11, color: c.textSecondary)),
            const Spacer(),
            Text(
              '\$${_fmtPrice(lo)}  –  \$${_fmtPrice(hi)}',
              style: TextStyle(
                fontSize: 11,
                color: c.textPrimary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        LayoutBuilder(builder: (_, constraints) {
          final w = constraints.maxWidth;
          return Stack(
            children: [
              Container(
                height: 4,
                decoration: BoxDecoration(
                  color: c.surfaceElevated,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              Positioned(
                left: (w - 6) * t,
                top: -1,
                child: Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: c.accent,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ],
          );
        }),
      ],
    );
  }

  Widget _extendedRow(AppPalette c) {
    final isPre = stock.preMarketPrice != null;
    final price = isPre ? stock.preMarketPrice! : stock.postMarketPrice!;
    final pct = isPre
        ? (stock.preMarketChangePercent ?? 0)
        : (stock.postMarketChangePercent ?? 0);
    final label = isPre ? 'Pre-market' : 'After-hours';
    final up = pct >= 0;
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: const Color(0x1FF59E0B),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: Color(0xFFF59E0B),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '\$${_fmtPrice(price)}',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: c.textPrimary,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          _fmtPct(pct),
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: up ? c.accent : c.danger,
          ),
        ),
      ],
    );
  }
}

String _fmtPct(double v) {
  final sign = v >= 0 ? '+' : '';
  return '$sign${v.toStringAsFixed(2)}%';
}

String _fmtPrice(double v) {
  if (v >= 1000) return v.toStringAsFixed(0);
  return v.toStringAsFixed(2);
}

String _fmtMarketCap(double v) {
  if (v >= 1e12) return '\$${(v / 1e12).toStringAsFixed(2)}T';
  if (v >= 1e9) return '\$${(v / 1e9).toStringAsFixed(1)}B';
  if (v >= 1e6) return '\$${(v / 1e6).toStringAsFixed(0)}M';
  return '\$${v.toStringAsFixed(0)}';
}
