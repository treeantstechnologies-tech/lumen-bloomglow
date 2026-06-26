import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import '../api.dart';
import '../theme.dart';

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});
  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  int level = 1, score = 0, lives = 4;
  double rad = 1;
  String phase = 'idle'; // idle, reveal, recall, over
  List<int> seq = [];
  final List<int> input = [];
  int? active;
  String status = 'Press Start, watch the pattern, then tap it back.';
  final rng = Random();
  Timer? countdown;
  int remain = 0;
  bool paused = false;

  void start() {
    if (phase == 'reveal' || phase == 'recall') return;
    if (phase == 'over') {
      level = 1; score = 0; lives = 4; rad = 1;
    }
    newRound();
  }

  Future<void> newRound() async {
    countdown?.cancel();
    input.clear();
    final len = 2 + (level / 2).ceil();
    seq = List.generate(len, (_) => rng.nextInt(9));
    setState(() { phase = 'reveal'; status = 'Watch closely…'; active = null; });
    await Future.delayed(const Duration(milliseconds: 350));
    for (final cell in seq) {
      if (!mounted) return;
      setState(() => active = cell);
      await Future.delayed(const Duration(milliseconds: 470));
      if (!mounted) return;
      setState(() => active = null);
      await Future.delayed(const Duration(milliseconds: 150));
    }
    if (!mounted) return;
    setState(() { phase = 'recall'; status = 'Your turn — tap the pattern.'; });
  }

  void tap(int i) {
    if (phase != 'recall') return;
    setState(() => active = i);
    Future.delayed(const Duration(milliseconds: 160), () { if (mounted) setState(() => active = null); });
    input.add(i);
    final p = input.length - 1;
    if (input[p] != seq[p]) {
      lives--;
      rad = 1;
      if (lives <= 0) {
        end();
      } else {
        setState(() { phase = 'idle'; status = 'A bud wilts. $lives left. Tap Start to retry.'; });
      }
      return;
    }
    if (input.length == seq.length) {
      final gain = (seq.length * 10 * rad).round();
      setState(() {
        score += gain;
        rad = min(rad + 0.5, 3);
        level++;
        phase = 'idle';
        status = 'Bloom! +$gain light. Next round shortly…';
      });
      startCountdown();
    }
  }

  void startCountdown() {
    remain = 3;
    paused = false;
    countdown?.cancel();
    countdown = Timer.periodic(const Duration(seconds: 1), (t) {
      if (paused) return;
      remain--;
      if (remain <= 0) {
        t.cancel();
        newRound();
      } else {
        setState(() {});
      }
    });
    setState(() {});
  }

  Future<void> end() async {
    countdown?.cancel();
    setState(() { phase = 'over'; status = 'The garden dims. Light earned: $score.'; });
    await Api.instance.submitScore(score, level, rad);
  }

  @override
  void dispose() {
    countdown?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inCountdown = remain > 0 && phase == 'idle';
    return Scaffold(
      appBar: AppBar(title: const Text('Journey')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Row(children: [
                  _pill('Level', '$level'),
                  _pill('Light', '$score'),
                  _pill('Radiance', '×${rad.toStringAsFixed(1)}'),
                  _pill('Buds', '$lives'),
                ]),
                const SizedBox(height: 16),
                AspectRatio(
                  aspectRatio: 1,
                  child: GridView.builder(
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3, crossAxisSpacing: 10, mainAxisSpacing: 10),
                    itemCount: 9,
                    itemBuilder: (_, i) {
                      final lit = active == i;
                      return GestureDetector(
                        onTap: () => tap(i),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          decoration: BoxDecoration(
                            color: Gb.buds[i].withOpacity(lit ? 1 : 0.40),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                                color: lit ? Colors.white : Colors.white24, width: lit ? 3 : 2),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 14),
                Text(status, textAlign: TextAlign.center, style: const TextStyle(color: Gb.muted)),
                const SizedBox(height: 12),
                if (inCountdown)
                  Column(children: [
                    Text('Next round in ${remain}s', style: const TextStyle(color: Gb.text)),
                    TextButton(
                        onPressed: () => setState(() => paused = !paused),
                        child: Text(paused ? 'Resume' : 'Pause')),
                  ])
                else
                  FilledButton(
                    onPressed: (phase == 'reveal' || phase == 'recall') ? null : start,
                    child: Text(phase == 'over'
                        ? 'Play again'
                        : (phase == 'idle' && score > 0 ? 'Continue' : 'Start')),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _pill(String label, String value) => Expanded(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 3),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(color: Gb.surface, borderRadius: BorderRadius.circular(10)),
          child: Column(children: [
            Text(label, style: const TextStyle(fontSize: 11, color: Gb.muted)),
            Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
          ]),
        ),
      );
}
