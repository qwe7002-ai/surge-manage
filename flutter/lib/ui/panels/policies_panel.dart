import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Policy groups (${state.policies.length})',
                style: const TextStyle(color: Colors.white54, fontSize: 13),
              ),
            ),
            FButton.icon(
              style: FButtonStyle.ghost,
              onPress: state.busy ? null : () => state.refreshPolicies(),
              child: const Icon(Icons.refresh, size: 18),
            ),
          ],
        ),
        PanelStatus(state: state),
        Expanded(
          child: ListView.separated(
            itemCount: state.policies.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, i) {
              final group = state.policies[i];
              return FCard(
                title: Text(group.name),
                subtitle: Text(group.type),
                child: DropdownButton<String>(
                  isExpanded: true,
                  value: group.selected,
                  hint: const Text('Select policy…'),
                  items: group.members
                      .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                      .toList(),
                  onChanged: state.busy
                      ? null
                      : (m) {
                          if (m != null) state.selectPolicy(group.name, m);
                        },
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
