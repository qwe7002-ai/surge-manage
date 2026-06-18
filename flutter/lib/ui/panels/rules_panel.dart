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
  final _tempCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>()
        ..refreshRules()
        ..refreshTempRules();
    });
  }

  @override
  void dispose() {
    _tempCtrl.dispose();
    super.dispose();
  }

  void _addTemp(AppState state) {
    final r = _tempCtrl.text.trim();
    if (r.isEmpty) return;
    state.addTempRule(r);
    _tempCtrl.clear();
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
        FCard(
          title: Text('Temporary rules (${state.tempRules.length})'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: FTextField(
                      controller: _tempCtrl,
                      hint: 'DOMAIN-SUFFIX,example.com,Proxy',
                    ),
                  ),
                  const SizedBox(width: 8),
                  FButton(
                    onPress: state.busy ? null : () => _addTemp(state),
                    label: const Text('Add'),
                  ),
                ],
              ),
              for (final r in state.tempRules)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(r,
                            style: const TextStyle(
                                fontFamily: 'monospace', fontSize: 11)),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline,
                            size: 16, color: Colors.redAccent),
                        onPressed:
                            state.busy ? null : () => state.delTempRule(r),
                      ),
                    ],
                  ),
                ),
              if (state.tempRules.isNotEmpty)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: state.busy ? null : () => state.flushTempRules(),
                    child: const Text('Flush all'),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
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
