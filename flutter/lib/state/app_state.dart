import 'dart:async';

import 'package:collection/collection.dart';
import 'package:flutter/foundation.dart';

import '../core/config_doc.dart';
import '../core/connection.dart';
import '../core/parsers.dart';
import '../core/secure_store.dart';
import '../core/types.dart';

/// Central app state (ChangeNotifier) consumed via `provider`. Holds the host
/// list and the live snapshot of the connected node.
class AppState extends ChangeNotifier {
  List<HostConfig> hosts = [];
  String? selectedHostId;
  ConnectionState connection = const ConnectionState();

  Environment? environment;
  PolicyDump? policies;
  Map<String, List<String>> subPolicies = {};
  final Map<String, PolicyTest> policyTests = {};
  List<Rule> rules = [];
  List<String> tempRules = [];
  List<ExternalResource> resources = [];
  Traffic? traffic;
  List<ActiveConnection> connections = [];
  List<String> profiles = [];
  /// Profile whose config file the structured editors read/write.
  String? activeProfile;
  final List<LogLine> logs = [];
  bool logStreaming = false;
  bool busy = false;
  String? lastError;
  String? lastInfo;

  static const _maxLogLines = 2000;
  bool _trafficInFlight = false;

  ConnectionManager? _manager;
  StreamSubscription<ConnectionState>? _stateSub;
  StreamSubscription<LogLine>? _logSub;
  Timer? _trafficTimer;

  HostConfig? get selectedHost =>
      hosts.where((h) => h.id == selectedHostId).cast<HostConfig?>().firstOrNull;

  bool get isConnected => connection.phase == ConnectionPhase.connected;

  Future<void> init() async {
    await refreshHosts();
  }

  Future<void> refreshHosts() async {
    hosts = await SecureStore.listHosts();
    selectedHostId ??= hosts.firstOrNull?.id;
    notifyListeners();
  }

  void selectHost(String? id) {
    selectedHostId = id;
    notifyListeners();
  }

  Future<void> saveHost(HostConfig host, {String? secret}) async {
    if (secret != null && secret.isNotEmpty && host.secretRef != null) {
      await SecureStore.setSecret(host.secretRef!, secret);
    }
    await SecureStore.saveHost(host);
    selectedHostId = host.id;
    await refreshHosts();
  }

  Future<void> removeHost(String id) async {
    await SecureStore.removeHost(id);
    if (selectedHostId == id) selectedHostId = null;
    await refreshHosts();
  }

  Future<void> connect(HostConfig host) async {
    await _teardownManager();
    lastError = null;
    final manager = ConnectionManager(host);
    _manager = manager;
    _stateSub = manager.state.listen(_onState);
    _logSub = manager.logs.listen(_onLog);
    try {
      await manager.connect();
    } catch (e) {
      lastError = e.toString();
      notifyListeners();
    }
  }

  Future<void> disconnect() async {
    await _manager?.disconnect();
  }

  void _onState(ConnectionState s) {
    connection = s;
    if (s.phase == ConnectionPhase.connected) {
      unawaited(refreshEnvironment());
      unawaited(refreshPolicies());
      unawaited(refreshTraffic());
      unawaited(refreshProfiles());
      _trafficTimer?.cancel();
      _trafficTimer =
          Timer.periodic(const Duration(seconds: 3), (_) => refreshTraffic());
    } else {
      _trafficTimer?.cancel();
      if (s.phase == ConnectionPhase.disconnected ||
          s.phase == ConnectionPhase.error) {
        environment = null;
        policies = null;
        subPolicies = {};
        policyTests.clear();
        rules = [];
        tempRules = [];
        resources = [];
        traffic = null;
        connections = [];
        profiles = [];
        logStreaming = false;
      }
    }
    notifyListeners();
  }

  void _onLog(LogLine line) {
    logs.add(line);
    if (logs.length > _maxLogLines) {
      logs.removeRange(0, logs.length - _maxLogLines);
    }
    notifyListeners();
  }

  Future<void> _guard(Future<void> Function() fn) async {
    busy = true;
    lastError = null;
    lastInfo = null;
    notifyListeners();
    try {
      await fn();
    } catch (e) {
      lastError = e.toString();
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> refreshEnvironment() => _guard(() async {
        final r = await _manager!.run(SurgeAction.environment);
        environment = parseEnvironment(r.stdout);
      });

  Future<void> refreshPolicies() => _guard(() async {
        final dump = await _manager!.run(SurgeAction.dumpPolicy);
        final dumped = parsePolicies(dump.stdout);
        var fromDump = <String, List<String>>{};
        try {
          final subs = await _manager!.run(SurgeAction.dumpPolicySubPolicies);
          fromDump = parseSubPolicies(subs.stdout);
        } catch (_) {
          fromDump = {};
        }
        // Proxy groups/proxies are most reliably read from the profile config.
        var cfgText = '';
        try {
          cfgText = (await _manager!.run(SurgeAction.dumpProfileOriginal)).stdout;
        } catch (_) {
          cfgText = '';
        }
        final cfgGroups = parseProxyGroups(cfgText);
        final cfgProxies = parseConfigProxies(cfgText);
        policies = PolicyDump(
          proxies: dumped.proxies.isNotEmpty ? dumped.proxies : cfgProxies,
          groups:
              dumped.groups.isNotEmpty ? dumped.groups : cfgGroups.keys.toList(),
        );
        subPolicies = {...fromDump, ...cfgGroups};
        final env = await _manager!.run(SurgeAction.environment);
        environment = parseEnvironment(env.stdout);
      });

  Future<void> selectPolicy(String group, String policy) => _guard(() async {
        await _manager!
            .run(SurgeAction.setEnvironment, ['ProxyGroupSelection.$group=$policy']);
        final env = await _manager!.run(SurgeAction.environment);
        environment = parseEnvironment(env.stdout);
      });

  Future<void> setProxyMode(int mode) => _guard(() async {
        await _manager!.run(SurgeAction.setEnvironment, ['ProxyMode=$mode']);
        final env = await _manager!.run(SurgeAction.environment);
        environment = parseEnvironment(env.stdout);
      });

  Future<void> refreshRules() => _guard(() async {
        final r = await _manager!.run(SurgeAction.dumpRule);
        rules = parseRules(r.stdout);
      });

  Future<void> refreshTempRules() async {
    try {
      final r = await _manager!.run(SurgeAction.dumpTempRule);
      tempRules = parseTempRules(r.stdout);
      notifyListeners();
    } catch (_) {
      tempRules = [];
    }
  }

  Future<void> addTempRule(String rule) => _guard(() async {
        await _manager!.run(SurgeAction.addTempRule, [rule]);
        final r = await _manager!.run(SurgeAction.dumpTempRule);
        tempRules = parseTempRules(r.stdout);
      });

  Future<void> delTempRule(String rule) => _guard(() async {
        await _manager!.run(SurgeAction.delTempRule, [rule]);
        final r = await _manager!.run(SurgeAction.dumpTempRule);
        tempRules = parseTempRules(r.stdout);
      });

  Future<void> updateTempRule(String oldRule, String newRule) => _guard(() async {
        await _manager!.run(SurgeAction.updateTempRule, [oldRule, newRule]);
        final r = await _manager!.run(SurgeAction.dumpTempRule);
        tempRules = parseTempRules(r.stdout);
      });

  Future<void> flushTempRules() => _guard(() async {
        await _manager!.run(SurgeAction.flushTempRule);
        tempRules = [];
      });

  Future<void> refreshResources() => _guard(() async {
        final r = await _manager!.run(SurgeAction.externalResourceList);
        resources = parseExternalResources(r.stdout);
      });

  Future<void> updateResource(String key) => _guard(() async {
        await _manager!.run(SurgeAction.externalResourceUpdate, [key]);
        final r = await _manager!.run(SurgeAction.externalResourceList);
        resources = parseExternalResources(r.stdout);
      });

  Future<void> updateAllResources() => _guard(() async {
        await _manager!.run(SurgeAction.externalResourceUpdateAll);
        final r = await _manager!.run(SurgeAction.externalResourceList);
        resources = parseExternalResources(r.stdout);
      });

  Future<void> refreshTraffic() async {
    // Guard against overlapping polls: a slow `dump active` on a busy node must
    // not pile up exec calls (which froze the Connections page).
    if (_trafficInFlight) return;
    _trafficInFlight = true;
    try {
      final r = await _manager!.run(SurgeAction.dumpActive);
      connections = parseActive(r.stdout);
      traffic = aggregateTraffic(connections);
      notifyListeners();
    } catch (_) {
      /* best-effort polling */
    } finally {
      _trafficInFlight = false;
    }
  }

  Future<void> setToggle(String key, bool on) => _guard(() async {
        await _manager!.run(SurgeAction.setEnvironment, ['$key=${on ? 1 : 0}']);
        final env = await _manager!.run(SurgeAction.environment);
        environment = parseEnvironment(env.stdout);
      });

  Future<void> killConnection(String id) => _guard(() async {
        await _manager!.run(SurgeAction.kill, [id]);
        await refreshTraffic();
      });

  Future<void> refreshProfiles() async {
    try {
      profiles = await _manager!.listProfiles();
      if (activeProfile == null || !profiles.contains(activeProfile)) {
        activeProfile = profiles.isNotEmpty ? profiles.first : null;
      }
      notifyListeners();
    } catch (_) {
      profiles = [];
      activeProfile = null;
    }
  }

  void setActiveProfile(String name) {
    activeProfile = name;
    notifyListeners();
  }

  Future<void> switchProfile(String name) => _guard(() async {
        await _manager!.run(SurgeAction.switchProfile, [name]);
        activeProfile = name;
        final env = await _manager!.run(SurgeAction.environment);
        environment = parseEnvironment(env.stdout);
        await refreshPolicies();
      });

  /// Remote profile path: `<configDir>/<profile>.conf`, defaulting the dir.
  String _profilePath(String profile) {
    final host = selectedHost;
    final raw = host?.configDir?.trim();
    final dir = (raw != null && raw.isNotEmpty) ? raw : kDefaultConfigDir;
    final trimmed = dir.replaceAll(RegExp(r'/+$'), '');
    return '$trimmed/$profile.conf';
  }

  /// Read a config section's entry lines from a profile file.
  Future<List<String>> readProfileSection(String profile, String section) async {
    final text = await _manager!.readProfile(_profilePath(profile));
    return getSectionEntries(parseConfigDocument(text), section);
  }

  /// Replace a config section's entries in a profile file, then reload.
  Future<void> writeProfileSection(
    String profile,
    String section,
    List<String> entries,
  ) =>
      _guard(() async {
        final path = _profilePath(profile);
        // Read-modify-write so we only touch this section, preserving the rest.
        final text = await _manager!.readProfile(path);
        final next = setSectionEntries(parseConfigDocument(text), section, entries);
        await _manager!.writeProfile(path, serializeConfigDocument(next));
        await _manager!.run(SurgeAction.reload);
        lastInfo = 'Saved $section to $profile.conf and reloaded';
      });

  void _mergeTests(List<PolicyTest> tests) {
    for (final t in tests) {
      policyTests[t.name] = t;
    }
  }

  Future<void> testAllPolicies() => _guard(() async {
        final r = await _manager!.run(SurgeAction.testAllPolicies);
        _mergeTests(parsePolicyTests(r.stdout));
      });

  Future<void> testGroup(String name) => _guard(() async {
        final r = await _manager!.run(SurgeAction.testGroup, [name]);
        _mergeTests(parsePolicyTests(r.stdout));
        lastInfo = 'Retested group "$name"';
      });

  Future<void> runAction(SurgeAction action, [List<String> args = const []]) =>
      _guard(() async {
        final r = await _manager!.run(action, args);
        final text = r.stdout.trim();
        lastInfo = text.isNotEmpty
            ? (text.length > 4000 ? text.substring(0, 4000) : text)
            : '${action.name} ok';
      });

  Future<CommandResult> runConfig(SurgeAction action) =>
      _manager!.run(action);

  void startLogs() {
    if (logStreaming) return;
    logStreaming = true;
    _manager?.startLogs();
    notifyListeners();
  }

  void stopLogs() {
    if (!logStreaming) return;
    logStreaming = false;
    _manager?.stopLogs();
    notifyListeners();
  }

  void clearLogs() {
    logs.clear();
    notifyListeners();
  }

  Future<void> _teardownManager() async {
    await _stateSub?.cancel();
    await _logSub?.cancel();
    _trafficTimer?.cancel();
    await _manager?.dispose();
    _manager = null;
  }

  @override
  void dispose() {
    _teardownManager();
    super.dispose();
  }
}
