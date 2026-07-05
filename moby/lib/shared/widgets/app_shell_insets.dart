import 'package:flutter/material.dart';

/// Height of the glass pill bottom nav that AppShell renders. Routes inside
/// AppShell use `extendBody: true`, so this height is NOT subtracted from
/// the body — every screen, modal sheet, and chart pane must reserve it
/// manually or content will sit behind the pill.
const double appShellNavPillHeight = 58.0;

/// Total bottom inset (AppShell nav pill + device safe area) that a screen
/// or sheet presented inside AppShell should reserve at its bottom.
///
/// Use this anywhere content would otherwise be occluded by the nav, e.g.:
/// ```dart
/// padding: EdgeInsets.only(bottom: appShellBottomInset(context))
/// ```
double appShellBottomInset(BuildContext context) =>
    appShellNavPillHeight + MediaQuery.viewPaddingOf(context).bottom;

/// Standardised bottom-sheet presenter that handles the recurring iOS-notch
/// and AppShell-nav-pill occlusion bugs. Use this in place of
/// `showModalBottomSheet` for any sheet shown from within AppShell.
///
/// Behaviour:
/// - `useSafeArea: true` — sheet body stays below the iOS notch (no
///   overlap with the status bar / Dynamic Island).
/// - `maxHeight: 85% of screen` — top of sheet stays well below the notch,
///   leaving the drag handle reachable.
/// - The builder's content should still reserve `appShellBottomInset` at
///   the bottom so the last row clears the glass nav pill.
Future<T?> showAppBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool enableDrag = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    // AppShell uses extendBody:true, so the glass nav pill paints in a layer
    // above the Scaffold body. go_router's ShellRoute runs routed pages
    // through a nested Navigator inside that body, so the default
    // useRootNavigator:false would insert this sheet's overlay *below* the
    // pill's paint layer, clipping its bottom edge. Route through the root
    // Navigator instead so the sheet overlays the entire shell, pill included.
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    enableDrag: enableDrag,
    backgroundColor: Colors.transparent,
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.85,
    ),
    builder: builder,
  );
}
