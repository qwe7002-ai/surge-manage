import 'dart:async';

import 'package:collection/collection.dart';
import 'package:flutter/foundation.dart';

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

  SurgeStatus? status;
  List<PolicyGroup> policies = [];
  List<Rule> rules = [];
  Traffic? traffic;
  final List<LogLine> logs = [];
  bool logStreaming = false;
  bool busy = false;
  String? lastError;

  static const _maxLogLines = 2000;

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
      unawaited(refreshStatus());
      unawaited(refreshPolicies());
      unawaited(refreshTraffic());
      _trafficTimer?.cancel();
      _trafficTimer =
          Timer.periodic(const Duration(seconds: 3), (_) => refreshTraffic());
    } else {
      _trafficTimer?.cancel();
      if (s.phase == ConnectionPhase.disconnected ||
          s.phase == ConnectionPhase.error) {
        status = null;
        policies = [];
        rules = [];
        traffic = null;
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

  Future<void> refreshStatus() => _guard(() async {
        final r = await _manager!.run(SurgeAction.status);
        status = parseStatus(r.stdout);
      });

  Future<void> refreshPolicies() => _guard(() async {
        final r = await _manager!.run(SurgeAction.policies);
        policies = parsePolicies(r.stdout);
      });

  Future<void> refreshRules() => _guard(() async {
        final r = await _manager!.run(SurgeAction.rules);
        rules = parseRules(r.stdout);
      });

  Future<void> refreshTraffic() async {
    try {
      final r = await _manager!.run(SurgeAction.traffic);
      traffic = parseTraffic(r.stdout);
      notifyListeners();
    } catch (_) {
      /* best-effort polling */
    }
  }

  Future<void> selectPolicy(String group, String member) => _guard(() async {
        await _manager!.run(SurgeAction.selectPolicy, [group, member]);
        final r = await _manager!.run(SurgeAction.policies);
        policies = parsePolicies(r.stdout);
      });

  Future<void> power(SurgeAction action) => _guard(() async {
        await _manager!.run(action);
        final r = await _manager!.run(SurgeAction.status);
        status = parseStatus(r.stdout);
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
