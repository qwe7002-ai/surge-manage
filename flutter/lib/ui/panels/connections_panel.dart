import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/parsers.dart';
import '../../state/app_state.dart';

class ConnectionsPanel extends StatefulWidget {
  const ConnectionsPanel({super.key});

  @override
  State<ConnectionsPanel> createState() => _ConnectionsPanelState();
}

class _ConnectionsPanelState extends State<ConnectionsPanel> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshTraffic();
    });
  }

  // Busy nodes can report thousands of connections; rendering them all (and
  // rebuilding every poll) froze the page. Cap the rows we draw.
  static const _maxRows = 300;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final conns = state.connections;
    final shown =
        conns.length > _maxRows ? conns.sublist(0, _maxRows) : conns;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text(
                conns.length > _maxRows
                    ? '${conns.length} active · first $_maxRows'
                    : '${conns.length} active',
                style: const TextStyle(color: Colors.white54, fontSize: 13)),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh, size: 18),
              onPressed: state.busy ? null : () => state.refreshTraffic(),
            ),
          ],
        ),
        Expanded(
          child: conns.isEmpty
              ? const Center(
                  child: Text('No active connections.',
                      style: TextStyle(color: Colors.white38)),
                )
              : ListView.separated(
                  itemCount: shown.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final c = shown[i];
                    return ListTile(
                      dense: true,
                      title: Text(
                        c.remote,
                        style: const TextStyle(
                            fontFamily: 'monospace', fontSize: 12),
                      ),
                      subtitle: Text(
                        '${c.policy ?? '—'}  ·  ↓${formatBytes(c.downloadBytes)}  ↑${formatBytes(c.uploadBytes)}',
                        style: const TextStyle(fontSize: 11),
                      ),
                      trailing: IconButton(
                        icon: const Icon(Icons.close,
                            size: 18, color: Colors.redAccent),
                        tooltip: 'Kill connection',
                        onPressed:
                            state.busy ? null : () => state.killConnection(c.id),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
