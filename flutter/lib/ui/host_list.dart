import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../core/types.dart';
import '../state/app_state.dart';
import 'home_page.dart';
import 'host_form.dart';

class HostListView extends StatelessWidget {
  const HostListView({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Hosts',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              ),
            ),
            FButton.icon(
              onPress: () => _openForm(context, null),
              child: const Icon(Icons.add),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          state.connection.phase.label,
          style: TextStyle(
            fontSize: 12,
            color: state.connection.phase == ConnectionPhase.error
                ? Colors.redAccent
                : Colors.white54,
          ),
        ),
        if (state.connection.error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              state.connection.error!,
              style: const TextStyle(fontSize: 12, color: Colors.redAccent),
            ),
          ),
        const SizedBox(height: 8),
        Expanded(
          child: state.hosts.isEmpty
              ? const Center(
                  child: Text(
                    'No hosts yet.\nAdd a Surge server to begin.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white38),
                  ),
                )
              : ListView.separated(
                  itemCount: state.hosts.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, i) =>
                      _HostCard(host: state.hosts[i], state: state),
                ),
        ),
      ],
    );
  }

  static void _openForm(BuildContext context, HostConfig? host) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF18181B),
      builder: (_) => HostForm(initial: host),
    );
  }
}

class _HostCard extends StatelessWidget {
  const _HostCard({required this.host, required this.state});
  final HostConfig host;
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final connecting = state.connection.phase == ConnectionPhase.connecting;
    return FCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.dns_outlined, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  host.label,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              FButton.icon(
                style: FButtonStyle.ghost,
                onPress: () => HostListView._openForm(context, host),
                child: const Icon(Icons.edit_outlined, size: 18),
              ),
              FButton.icon(
                style: FButtonStyle.ghost,
                onPress: () => state.removeHost(host.id),
                child: const Icon(Icons.delete_outline,
                    size: 18, color: Colors.redAccent),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${host.username}@${host.host}:${host.port}',
            style: const TextStyle(fontSize: 12, color: Colors.white54),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FButton(
              onPress: connecting
                  ? null
                  : () {
                      state.selectHost(host.id);
                      state.connect(host);
                    },
              label: Text(connecting ? 'Connecting…' : 'Connect'),
            ),
          ),
        ],
      ),
    );
  }
}
