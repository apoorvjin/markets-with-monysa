import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../core/theme/app_palette.dart';

class SparklineChart extends StatelessWidget {
  const SparklineChart({
    super.key,
    required this.data,
    this.color,
    this.height = 36,
    this.width = 80,
  });

  final List<double> data;
  final Color? color;
  final double height;
  final double width;

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) return SizedBox(width: width, height: height);

    final c = context.colors;
    final isPositive = data.last >= data.first;
    final lineColor = color ?? (isPositive ? c.positive : c.danger);

    final spots = data.asMap().entries
        .map((e) => FlSpot(e.key.toDouble(), e.value))
        .toList();

    return ExcludeSemantics(
      child: SizedBox(
      width: width,
      height: height,
      child: LineChart(
        LineChartData(
          gridData: const FlGridData(show: false),
          titlesData: const FlTitlesData(show: false),
          borderData: FlBorderData(show: false),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              curveSmoothness: 0.3,
              color: lineColor,
              barWidth: 1.5,
              isStrokeCapRound: true,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(show: false),
            ),
          ],
          lineTouchData: const LineTouchData(enabled: false),
        ),
        duration: Duration.zero,
      ),
      ),
    );
  }
}
