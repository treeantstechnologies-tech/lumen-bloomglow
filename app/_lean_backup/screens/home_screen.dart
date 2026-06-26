import 'package:flutter/material.dart';
import '../api.dart';
import '../theme.dart';
import 'game_screen.dart';
import 'leaderboard_screen.dart';

class HomeScreen extends StatefulWidget {
  final VoidCallback onLogout;
  const HomeScreen({super.key, required this.onLogout});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? stats;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final s = await Api.instance.myStats();
      if (mounted) setState(() => stats = s);
    } catch (_) {}
  }

  Future<void> logout() async {
    await Api.instance.logout();
    widget.onLogout();
  }

  @override
  Widget build(BuildContext context) {
    final name = (Api.instance.user?['displayName'] ?? 'Player').toString();
    final s = stats;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Glowbloom'),
        actions: [IconButton(onPressed: logout, icon: const Icon(Icons.logout))],
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Welcome, $name',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                const SizedBox(height: 14),
                Row(children: [
                  _stat('Highest level', '${s?['bestLevel'] ?? 0}'),
                  const SizedBox(width: 12),
                  _stat('Best score', '${s?['bestScore'] ?? 0}'),
                ]),
                const SizedBox(height: 12),
                Row(children: [
                  _stat('Rounds', '${s?['runs'] ?? 0}'),
                  const SizedBox(width: 12),
                  _stat('Radiance', '×${(s?['bestRadiance'] ?? 1)}'),
                ]),
                const SizedBox(height: 22),
                FilledButton.icon(
                  onPressed: () async {
                    await Navigator.push(context,
                        MaterialPageRoute(builder: (_) => const GameScreen()));
                    load();
                  },
                  icon: const Icon(Icons.play_arrow),
                  label: const Text('Play · Journey'),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => const LeaderboardScreen())),
                  icon: const Icon(Icons.leaderboard),
                  label: const Text('Leaderboards & ranking'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _stat(String label, String value) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Gb.surface, borderRadius: BorderRadius.circular(12)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              Text(label, style: const TextStyle(color: Gb.muted, fontSize: 13)),
            ],
          ),
        ),
      );
}
