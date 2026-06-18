/// Domain model — the Dart mirror of `packages/shared/src/types.ts`.
/// Keep the two in sync when the command catalog or models change.
library;

import 'package:collection/collection.dart';

enum AuthMethod { key, password, agent }

/// Maps 1:1 onto real Surge CLI commands. Query actions run with `--raw`.
enum SurgeAction {
  reload,
  stop,
  switchProfile,
  environment,
  dumpPolicy,
  dumpPolicySubPolicies,
  dumpRule,
  dumpActive,
  dumpRequest,
  dumpDns,
  dumpTempRule,
  dumpProfileEffective,
  dumpProfileOriginal,
  watchRequest,
  testNetwork,
  testPolicy,
  testAllPolicies,
  testGroup,
  testPolicyBandwidth,
  addTempRule,
  delTempRule,
  updateTempRule,
  flushTempRule,
  externalResourceList,
  externalResourceUpdate,
  externalResourceUpdateAll,
  flushDns,
  diagnostics,
  kill,
  setLogLevel,
  setEnvironment,
}

enum ConnectionPhase {
  disconnected,
  connecting,
  connected,
  error,
}

enum LogLevel { debug, info, notify, warning, error, unknown }

/// Default Surge CLI location (macOS bundle path). A bare `surge-cli` is rarely
/// on PATH, so we default to the documented absolute path.
const String kDefaultSurgeBin =
    '/Applications/Surge.app/Contents/Applications/surge-cli';

/// Default Surge profile directory (macOS), used when a host omits `configDir`.
const String kDefaultConfigDir = '~/Library/Application Support/Surge/Profiles';

/// Per-host customisation of how the `surge` binary is invoked.
class SurgeProfile {
  const SurgeProfile({this.bin = kDefaultSurgeBin, this.argv = const {}});

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
    return SurgeProfile(bin: (j['bin'] as String?) ?? kDefaultSurgeBin, argv: parsed);
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
    this.configDir,
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
  final String? configDir;
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
        'configDir': configDir,
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
        configDir: j['configDir'] as String?,
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

class Environment {
  const Environment({
    this.fields = const {},
    this.selection = const {},
    this.proxyMode,
    this.raw,
  });
  final Map<String, String> fields;

  /// ProxyGroupSelection: select-group name → currently selected policy.
  final Map<String, String> selection;

  /// ProxyMode: 0 = Direct, 1 = Global, 2 = Rule.
  final int? proxyMode;
  final dynamic raw;
}

/// Outbound mode values for the `ProxyMode` environment key.
const proxyModes = [
  (value: 0, label: 'Direct'),
  (value: 1, label: 'Global'),
  (value: 2, label: 'Rule'),
];

/// Boolean environment switches togglable with `set <Key>=0|1`.
const featureToggles = [
  (key: 'MitMEnabled', label: 'MitM'),
  (key: 'RewriteEnabled', label: 'Rewrite'),
  (key: 'ScriptingEnabled', label: 'Scripting'),
  (key: 'Replica', label: 'HTTP Capture'),
];

bool isToggleOn(String? value) => value == '1' || value == 'true';

/// From `surge --raw dump policy` → names of proxies and policy groups.
class PolicyDump {
  const PolicyDump({this.proxies = const [], this.groups = const []});
  final List<String> proxies;
  final List<String> groups;
}

/// One proxy's result from `test-all-policies` / `test-policy` / `test-group`.
class PolicyTest {
  const PolicyTest({
    required this.name,
    this.tcpMs,
    this.receiveMs,
    this.available,
    this.roundOneTotal,
    this.error,
  });

  final String name;
  final int? tcpMs;
  final int? receiveMs;
  final int? available;
  final int? roundOneTotal;
  final String? error;

  int? get latencyMs => receiveMs ?? tcpMs;
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

class ExternalResource {
  const ExternalResource({required this.key, this.url, this.ready, this.updatedAt});
  final String key;
  final String? url;
  final bool? ready;
  final int? updatedAt;
}

class ActiveConnection {
  const ActiveConnection({
    required this.id,
    required this.remote,
    this.policy,
    this.rule,
    this.uploadBytes,
    this.downloadBytes,
  });

  final String id;
  final String remote;
  final String? policy;
  final String? rule;
  final num? uploadBytes;
  final num? downloadBytes;
}

class Traffic {
  const Traffic({this.uploadTotal, this.downloadTotal, this.connections});

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
