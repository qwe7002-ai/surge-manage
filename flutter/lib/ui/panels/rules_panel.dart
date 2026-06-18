import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../../core/types.dart';
import '../../state/app_state.dart';
import '../home_page.dart';

class RulesPanel extends StatefulWidget {
  const RulesPanel({super.key});

  @override
  State<RulesPanel> createState() => _RulesPanelState();
}

class _RulesPanelState extends State<RulesPanel> {
  String _query = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshRules();
    });
  }

  List<Rule> _filtered(List<Rule> rules) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return rules;
    return rules
        .where((r) =>
            r.type.toLowerCase().contains(q) ||
            r.value.toLowerCase().contains(q) ||
            r.policy.toLowerCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final rules = _filtered(state.rules);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: FTextField(
                hint: 'Filter rules…',
                onChange: (v) => setState(() => _query = v),
              ),
            ),
            const SizedBox(width: 8),
            FButton.icon(
              style: FButtonStyle.ghost,
              onPress: state.busy ? null : () => state.refreshRules(),
              child: const Icon(Icons.refresh, size: 18),
            ),
          ],
        ),
        PanelStatus(state: state),
        Expanded(
          child: ListView.separated(
            itemCount: rules.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final r = rules[i];
              return ListTile(
                dense: true,
                leading: FBadge(label: Text(r.type)),
                title: Text(
                  r.value.isEmpty ? '—' : r.value,
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                ),
                subtitle: Text(r.policy),
                trailing: r.hits != null ? Text('${r.hits}') : null,
              );
            },
          ),
        ),
      ],
    );
  }
}
