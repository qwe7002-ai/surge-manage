/// Domain model — the Dart mirror of `packages/shared/src/types.ts`.
/// Keep the two in sync when the command catalog or models change.
library;

import 'package:collection/collection.dart';

enum AuthMethod { key, password, agent }

enum SurgeAction {
  version,
  status,
  start,
  stop,
  restart,
  reload,
  policies,
  selectPolicy,
  rules,
  traffic,
  logsTail,
  configPath,
  configShow,
  test,
}

enum ConnectionPhase {
  disconnected,
  sshConnecting,
  moshBootstrapping,
  connected,
  error,
}

enum LogLevel { debug, info, notify, warning, error, unknown }

/// Per-host customisation of how the `surge` binary is invoked.
class SurgeProfile {
  const SurgeProfile({this.bin = 'surge', this.argv = const {}});

  final String bin;
  final Map<SurgeAction, List<String>> argv;

  Map<String, dynamic> toJson() => {
        'bin': bin,
        'argv': argv.map((k, v) => MapEntry(k.name, v)),
      };

  factory SurgeProfile.fromJson(Map<String, dynamic> j) {
    final raw = (j['argv'] as Map?)?.cast<String, dynamic>() ?? const {};
    final parsed = <SurgeAction, List<String>>{};
    for (final entry in raw.entries) {
      final action = SurgeAction.values
          .where((a) => a.name == entry.key)
          .cast<SurgeAction?>()
          .firstOrNull;
      if (action != null) {
        parsed[action] = (entry.value as List).cast<String>();
      }
    }
    return SurgeProfile(bin: (j['bin'] as String?) ?? 'surge', argv: parsed);
  }
}

class HostConfig {
  HostConfig({
    required this.id,
    required this.label,
    required this.host,
    required this.port,
    required this.username,
    required this.auth,
    this.privateKeyPath,
    this.secretRef,
    SurgeProfile? surge,
    this.moshServerArgs,
    required this.createdAt,
    this.lastConnectedAt,
  }) : surge = surge ?? const SurgeProfile();

  final String id;
  final String label;
  final String host;
  final int port;
  final String username;
  final AuthMethod auth;
  final String? privateKeyPath;
  final String? secretRef;
  final SurgeProfile surge;
  final List<String>? moshServerArgs;
  final int createdAt;
  final int? lastConnectedAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'host': host,
        'port': port,
        'username': username,
        'auth': auth.name,
        'privateKeyPath': privateKeyPath,
        'secretRef': secretRef,
        'surge': surge.toJson(),
        'moshServerArgs': moshServerArgs,
        'createdAt': createdAt,
        'lastConnectedAt': lastConnectedAt,
      };

  factory HostConfig.fromJson(Map<String, dynamic> j) => HostConfig(
        id: j['id'] as String,
        label: j['label'] as String,
        host: j['host'] as String,
        port: j['port'] as int,
        username: j['username'] as String,
        auth: AuthMethod.values.firstWhere(
          (a) => a.name == j['auth'],
          orElse: () => AuthMethod.key,
        ),
        privateKeyPath: j['privateKeyPath'] as String?,
        secretRef: j['secretRef'] as String?,
        surge: j['surge'] == null
            ? const SurgeProfile()
            : SurgeProfile.fromJson((j['surge'] as Map).cast<String, dynamic>()),
        moshServerArgs: (j['moshServerArgs'] as List?)?.cast<String>(),
        createdAt: j['createdAt'] as int,
        lastConnectedAt: j['lastConnectedAt'] as int?,
      );
}

class ConnectionState {
  const ConnectionState({
    this.phase = ConnectionPhase.disconnected,
    this.hostId,
    this.error,
    this.latencyMs,
  });

  final ConnectionPhase phase;
  final String? hostId;
  final String? error;
  final int? latencyMs;

  bool get isConnected => phase == ConnectionPhase.connected;
}

class CommandResult {
  const CommandResult({
    required this.action,
    required this.exitCode,
    required this.stdout,
    required this.durationMs,
  });

  final SurgeAction action;
  final int exitCode;
  final String stdout;
  final int durationMs;
}

class SurgeStatus {
  const SurgeStatus({
    required this.running,
    this.version,
    this.mode,
    this.uptimeSeconds,
    this.outboundMode,
    this.activePolicy,
  });

  final bool running;
  final String? version;
  final String? mode;
  final int? uptimeSeconds;
  final String? outboundMode;
  final String? activePolicy;
}

class PolicyGroup {
  const PolicyGroup({
    required this.name,
    required this.type,
    this.selected,
    this.members = const [],
  });

  final String name;
  final String type;
  final String? selected;
  final List<String> members;
}

class Rule {
  const Rule({
    required this.type,
    required this.value,
    required this.policy,
    this.hits,
  });

  final String type;
  final String value;
  final String policy;
  final int? hits;
}

class Traffic {
  const Traffic({
    this.uploadBps,
    this.downloadBps,
    this.uploadTotal,
    this.downloadTotal,
    this.connections,
  });

  final num? uploadBps;
  final num? downloadBps;
  final num? uploadTotal;
  final num? downloadTotal;
  final int? connections;
}

class LogLine {
  const LogLine({required this.ts, required this.level, required this.message});

  final int ts;
  final LogLevel level;
  final String message;
}
