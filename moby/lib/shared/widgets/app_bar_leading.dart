import 'package:flutter/material.dart';

import 'app_logo_badge.dart';
import 'global_search_button.dart';

/// Standard AppBar leading area for every main tab — global search icon on
/// the left of the app logo badge. Pair with `leadingWidth: appBarLeadingWidth`
/// on the AppBar (the default 56px only fits one icon, not both).
class AppBarLeading extends StatelessWidget {
  const AppBarLeading({super.key});

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        GlobalSearchButton(),
        AppLogoBadge(),
      ],
    );
  }
}

const double appBarLeadingWidth = 100;
