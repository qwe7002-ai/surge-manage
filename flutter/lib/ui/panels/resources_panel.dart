import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../home_page.dart';

class ResourcesPanel extends StatefulWidget {
  const ResourcesPanel({super.key});

  @override
  State<ResourcesPanel> createState() => _ResourcesPanelState();
}

class _ResourcesPanelState extends State<ResourcesPanel> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshResources();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final resources = state.resources;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('External resources (${resources.length})',
                style: const TextStyle(color: Colors.white54, fontSize: 13)),
            const Spacer(),
            FButton(
              onPress: state.busy || resources.isEmpty
                  ? null
                  : () => state.updateAllResources(),
              label: const Text('Update all'),
            ),
            const SizedBox(width: 8),
            FButton.icon(
              style: FButtonStyle.ghost,
              onPress: state.busy ? null : () => state.refreshResources(),
              child: const Icon(Icons.refresh, size: 18),
            ),
          ],
        ),
        PanelStatus(state: state),
        Expanded(
          child: resources.isEmpty
              ? const Center(
                  child: Text('No external resources.',
                      style: TextStyle(color: Colors.white38)),
                )
              : ListView.separated(
                  itemCount: resources.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final r = resources[i];
                    return ListTile(
                      dense: true,
                      title: Text(
                        r.url ?? r.key,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontFamily: 'monospace', fontSize: 12),
                      ),
                      subtitle: Text(
                        r.updatedAt != null
                            ? DateTime.fromMillisecondsSinceEpoch(r.updatedAt!)
                                .toString()
                            : (r.ready == false ? 'pending' : 'ready'),
                        style: const TextStyle(fontSize: 11),
                      ),
                      trailing: TextButton(
                        onPressed:
                            state.busy ? null : () => state.updateResource(r.key),
                        child: const Text('Update'),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
