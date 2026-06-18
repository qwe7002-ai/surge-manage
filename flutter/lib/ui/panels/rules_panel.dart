import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../home_page.dart';
import '../section_editor.dart';

class RulesPanel extends StatefulWidget {
  const RulesPanel({super.key});

  @override
  State<RulesPanel> createState() => _RulesPanelState();
}

class _RulesPanelState extends State<RulesPanel> {
  int _tab = 0; // 0 = permanent, 1 = temporary

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>()
        ..refreshTempRules()
        ..refreshProfiles();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, label: Text('Permanent')),
              ButtonSegment(value: 1, label: Text('Temporary')),
            ],
            selected: {_tab},
            onSelectionChanged: (s) => setState(() => _tab = s.first),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _tab == 0
              ? const SectionEditor(
                  section: 'Rule',
                  placeholder: 'DOMAIN-SUFFIX,example.com,Proxy',
                  hint: 'Edits the [Rule] section of the selected profile, then reloads.',
                )
              : const _TemporaryRules(),
        ),
      ],
    );
  }
}

class _TemporaryRules extends StatefulWidget {
  const _TemporaryRules();

  @override
  State<_TemporaryRules> createState() => _TemporaryRulesState();
}

class _TemporaryRulesState extends State<_TemporaryRules> {
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _add(AppState state) {
    final r = _ctrl.text.trim();
    if (r.isEmpty) return;
    state.addTempRule(r);
    _ctrl.clear();
  }

  Future<void> _edit(AppState state, String rule) async {
    final editCtrl = TextEditingController(text: rule);
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit temporary rule'),
        content: TextField(
          controller: editCtrl,
          autofocus: true,
          style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(editCtrl.text.trim()),
              child: const Text('Save')),
        ],
      ),
    );
    editCtrl.dispose();
    if (next != null && next.isNotEmpty && next != rule) {
      await state.updateTempRule(rule, next);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: FTextField(
                controller: _ctrl,
                hint: 'DOMAIN-SUFFIX,example.com,Proxy',
              ),
            ),
            const SizedBox(width: 8),
            FButton(
              onPress: state.busy ? null : () => _add(state),
              label: const Text('Add'),
            ),
          ],
        ),
        if (state.tempRules.isNotEmpty)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: state.busy ? null : () => state.flushTempRules(),
              child: const Text('Flush all'),
            ),
          ),
        PanelStatus(state: state),
        Expanded(
          child: state.tempRules.isEmpty
              ? const Center(
                  child: Text('No temporary rules.',
                      style: TextStyle(color: Colors.white38)),
                )
              : ListView.separated(
                  itemCount: state.tempRules.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final r = state.tempRules[i];
                    return ListTile(
                      dense: true,
                      title: Text(r,
                          style: const TextStyle(
                              fontFamily: 'monospace', fontSize: 12)),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit_outlined, size: 16),
                            onPressed:
                                state.busy ? null : () => _edit(state, r),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline,
                                size: 16, color: Colors.redAccent),
                            onPressed:
                                state.busy ? null : () => state.delTempRule(r),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
