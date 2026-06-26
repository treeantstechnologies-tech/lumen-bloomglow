import 'package:flutter/material.dart';
import '../api.dart';
import '../theme.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});
  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen>
    with SingleTickerProviderStateMixin {
  late final TabController tabs;
  static const windows = ['day', 'week', 'month', 'all'];
  static const labels = ['Today', 'Week', 'Month', 'Overall'];

  @override
  void initState() {
    super.initState();
    tabs = TabController(length: windows.length, vsync: this);
  }

  @override
  void dispose() {
    tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Leaderboards'),
        bottom: TabBar(controller: tabs, tabs: [for (final l in labels) Tab(text: l)]),
      ),
      body: TabBarView(controller: tabs, children: [for (final w in windows) _Board(window: w)]),
    );
  }
}

class _Board extends StatefulWidget {
  final String window;
  const _Board({required this.window});
  @override
  State<_Board> createState() => _BoardState();
}

class _BoardState extends State<_Board> with AutomaticKeepAliveClientMixin {
  List<dynamic>? rows;
  int? rank;
  bool err = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final t = await Api.instance.top(widget.window);
      final r = await Api.instance.myRank(widget.window);
      if (mounted) setState(() { rows = t; rank = r; });
    } catch (_) {
      if (mounted) setState(() => err = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (err) {
      return const Center(
        child: Padding(padding: EdgeInsets.all(24),
          child: Text('Could not load the leaderboard.', style: TextStyle(color: Gb.muted))),
      );
    }
    if (rows == null) return const Center(child: CircularProgressIndicator());
    if (rows!.isEmpty) {
      return const Center(child: Text('No scores yet. Be the first to bloom!', style: TextStyle(color: Gb.muted)));
    }
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        if (rank != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('Your rank: #$rank',
                style: const TextStyle(color: Gb.primary, fontWeight: FontWeight.bold)),
          ),
        for (var i = 0; i < rows!.length; i++) _row(i + 1, rows![i] as Map<String, dynamic>),
      ],
    );
  }

  Widget _row(int n, Map<String, dynamic> r) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: Gb.surface, borderRadius: BorderRadius.circular(10)),
        child: Row(children: [
          SizedBox(width: 32, child: Text('#$n',
              style: const TextStyle(color: Gb.radiance, fontWeight: FontWeight.bold))),
          Expanded(child: Text((r['name'] ?? 'Player').toString())),
          Text('Lv ${r['level'] ?? 1}', style: const TextStyle(color: Gb.muted, fontSize: 13)),
          const SizedBox(width: 12),
          Text('${r['light'] ?? 0}',
              style: const TextStyle(color: Gb.bloom, fontWeight: FontWeight.bold)),
        ]),
      );
}
