import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_palette.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../data/models/notification_log_item.dart';
import '../../data/repositories/notifications_repository.dart';
import '../../providers/notification_read_provider.dart';

/// AppBar button showing broadcast-push history (VIX regime changes,
/// pre-market sector gainers, any future trigger) — independent of whether
/// the OS notification was ever seen on this device. Sits right after
/// [MarketStatusButton] on every screen that has one; copies its exact
/// overlay mechanism (LayerLink + CompositedTransformFollower) so the two
/// behave identically.
class NotificationBellButton extends ConsumerStatefulWidget {
  const NotificationBellButton({super.key});

  @override
  ConsumerState<NotificationBellButton> createState() => _NotificationBellButtonState();
}

class _NotificationBellButtonState extends ConsumerState<NotificationBellButton> {
  final LayerLink _link = LayerLink();
  OverlayEntry? _entry;
  Timer? _timer;
  List<NotificationLogItem> _items = [];

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) => _refresh());
  }

  Future<void> _refresh() async {
    try {
      final items = await NotificationsRepository.instance.fetchLog();
      if (mounted) setState(() => _items = items);
      _entry?.markNeedsBuild();
    } catch (_) {
      // Stale/empty is fine — the badge just reflects whatever we last had.
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _hide();
    super.dispose();
  }

  void _hide() {
    _entry?.remove();
    _entry = null;
  }

  void _toggle() {
    if (_entry != null) {
      _hide();
      return;
    }
    _entry = OverlayEntry(
      builder: (ctx) => Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _hide,
              child: const SizedBox.expand(),
            ),
          ),
          CompositedTransformFollower(
            link: _link,
            showWhenUnlinked: false,
            targetAnchor: Alignment.bottomRight,
            followerAnchor: Alignment.topRight,
            offset: const Offset(0, 8),
            child: Material(
              color: Colors.transparent,
              child: _NotificationPanel(items: _items),
            ),
          ),
        ],
      ),
    );
    Overlay.of(context).insert(_entry!);
    // Opening the panel is "seen" — matches how most notification centers work.
    ref.read(notificationReadProvider.notifier).markRead(_items.map((i) => i.id));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final readIds = ref.watch(notificationReadProvider);
    final unreadCount = _items.where((i) => !readIds.contains(i.id)).length;
    return CompositedTransformTarget(
      link: _link,
      child: Semantics(
        label: unreadCount > 0 ? '$unreadCount unread notifications' : 'Notifications',
        button: true,
        child: GestureDetector(
          onTap: _toggle,
          behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s2),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  unreadCount > 0
                      ? Icons.notifications_rounded
                      : Icons.notifications_none_rounded,
                  color: c.textSecondary,
                  size: 22,
                ),
                if (unreadCount > 0)
                  Positioned(
                    right: -4,
                    top: -3,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(color: c.danger, shape: BoxShape.circle),
                      constraints: const BoxConstraints(minWidth: 14, minHeight: 14),
                      child: Text(
                        unreadCount > 9 ? '9+' : '$unreadCount',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 9,
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NotificationPanel extends StatelessWidget {
  const _NotificationPanel({required this.items});
  final List<NotificationLogItem> items;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: 300,
      constraints: const BoxConstraints(maxHeight: 420),
      margin: const EdgeInsets.only(right: AppSpacing.s4),
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: c.surfaceElevated,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: c.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(100),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Notifications', style: AppTypography.labelLg.copyWith(color: c.textPrimary)),
          const SizedBox(height: AppSpacing.s3),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.s3),
              child: Text(
                'Nothing yet today.',
                style: AppTypography.sm.copyWith(color: c.textMuted),
              ),
            )
          else
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: items.length,
                separatorBuilder: (_, __) => Divider(height: AppSpacing.s5, color: c.border),
                itemBuilder: (ctx, i) => _NotificationRow(item: items[i]),
              ),
            ),
        ],
      ),
    );
  }
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.item});
  final NotificationLogItem item;

  String _ageLabel() {
    final ms = item.firedAtMs;
    if (ms == null) return '';
    final diff = DateTime.now().difference(DateTime.fromMillisecondsSinceEpoch(ms));
    if (diff.inMinutes < 1) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                item.title,
                style: AppTypography.sm.copyWith(
                  color: c.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.s2),
            Text(_ageLabel(), style: AppTypography.xs.copyWith(color: c.textMuted)),
          ],
        ),
        const SizedBox(height: 2),
        Text(item.body, style: AppTypography.xs.copyWith(color: c.textSecondary)),
      ],
    );
  }
}
