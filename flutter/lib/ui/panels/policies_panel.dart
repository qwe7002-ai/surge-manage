import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../../core/types.dart';
import '../../state/app_state.dart';
import '../home_page.dart';

class PoliciesPanel extends StatefulWidget {
  const PoliciesPanel({super.key});

  @override
  State<PoliciesPanel> createState() => _PoliciesPanelState();
}

class _PoliciesPanelState extends State<PoliciesPanel> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshPolicies();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final proxies = state.policies?.proxies ?? const [];
    final groups = state.policies?.groups ?? const [];

    return ListView(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '${groups.length} groups · ${proxies.length} proxies',
                style: const TextStyle(color: Colors.white54, fontSize: 13),
              ),
            ),
            FButton(
              onPress: state.busy ? null : () => state.testAllPolicies(),
              label: const Text('Test all'),
            ),
          ],
        ),
        PanelStatus(state: state),
        const SizedBox(height: 8),
        FCard(
          title: const Text('Policy groups'),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (groups.isEmpty)
                const Text('No policy groups.',
                    style: TextStyle(color: Colors.white54)),
              for (final g in groups)
                FButton(
                  style: FButtonStyle.outline,
                  onPress: state.busy ? null : () => state.testGroup(g),
                  label: Text(g),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        FCard(
          title: const Text('Proxies'),
          child: Column(
            children: [
              for (final p in proxies)
                _ProxyRow(name: p, test: state.policyTests[p]),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProxyRow extends StatelessWidget {
  const _ProxyRow({required this.name, this.test});
  final String name;
  final PolicyTest? test;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(name, overflow: TextOverflow.ellipsis)),
          _latency(),
        ],
      ),
    );
  }

  Widget _latency() {
    final t = test;
    if (t == null) {
      return const Text('—', style: TextStyle(color: Colors.white38, fontSize: 12));
    }
    if (t.error != null) {
      return const Text('failed',
          style: TextStyle(color: Colors.redAccent, fontSize: 12));
    }
    final ms = t.latencyMs;
    if (ms == null) {
      return const Text('—', style: TextStyle(color: Colors.white38, fontSize: 12));
    }
    final color = ms < 300
        ? Colors.greenAccent
        : ms < 800
            ? Colors.amberAccent
            : Colors.redAccent;
    return Text('$ms ms', style: TextStyle(color: color, fontSize: 12));
  }
}
