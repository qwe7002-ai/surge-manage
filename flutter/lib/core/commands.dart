import 'types.dart';

/// Declarative surge command catalog — the Dart mirror of
/// `packages/shared/src/commands.ts`.
class CommandSpec {
  const CommandSpec({
    required this.action,
    required this.argv,
    required this.mutates,
    required this.arity,
    this.streaming = false,
  });

  final SurgeAction action;
  final List<String> argv;
  final bool mutates;
  final int arity;
  final bool streaming;
}

const Map<SurgeAction, CommandSpec> commandCatalog = {
  SurgeAction.reload:
      CommandSpec(action: SurgeAction.reload, argv: ['reload'], mutates: true, arity: 0),
  SurgeAction.stop:
      CommandSpec(action: SurgeAction.stop, argv: ['stop'], mutates: true, arity: 0),
  SurgeAction.switchProfile: CommandSpec(
      action: SurgeAction.switchProfile,
      argv: ['switch-profile', '{0}'],
      mutates: true,
      arity: 1),
  SurgeAction.unattendedUpgrade: CommandSpec(
      action: SurgeAction.unattendedUpgrade,
      argv: ['unattended-upgrade'],
      mutates: true,
      arity: 0),
  SurgeAction.environment: CommandSpec(
      action: SurgeAction.environment, argv: ['--raw', 'environment'], mutates: false, arity: 0),
  SurgeAction.dumpPolicy: CommandSpec(
      action: SurgeAction.dumpPolicy, argv: ['--raw', 'dump', 'policy'], mutates: false, arity: 0),
  SurgeAction.dumpPolicySubPolicies: CommandSpec(
      action: SurgeAction.dumpPolicySubPolicies,
      argv: ['--raw', 'dump', 'policy-group-sub-policies'],
      mutates: false,
      arity: 0),
  SurgeAction.dumpRule: CommandSpec(
      action: SurgeAction.dumpRule, argv: ['--raw', 'dump', 'rule'], mutates: false, arity: 0),
  SurgeAction.dumpActive: CommandSpec(
      action: SurgeAction.dumpActive, argv: ['--raw', 'dump', 'active'], mutates: false, arity: 0),
  SurgeAction.dumpRequest: CommandSpec(
      action: SurgeAction.dumpRequest, argv: ['--raw', 'dump', 'request'], mutates: false, arity: 0),
  SurgeAction.dumpDns: CommandSpec(
      action: SurgeAction.dumpDns, argv: ['--raw', 'dump', 'dns'], mutates: false, arity: 0),
  SurgeAction.dumpEvent: CommandSpec(
      action: SurgeAction.dumpEvent, argv: ['--raw', 'dump', 'event'], mutates: false, arity: 0),
  SurgeAction.dumpVirtualIpDb: CommandSpec(
      action: SurgeAction.dumpVirtualIpDb,
      argv: ['--raw', 'dump', 'virtual-ip-db'],
      mutates: false,
      arity: 0),
  SurgeAction.dumpTempRule: CommandSpec(
      action: SurgeAction.dumpTempRule,
      argv: ['--raw', 'dump', 'temp-rule'],
      mutates: false,
      arity: 0),
  SurgeAction.dumpSmartGroupInfo: CommandSpec(
      action: SurgeAction.dumpSmartGroupInfo,
      argv: ['--raw', 'dump', 'smart-group-info'],
      mutates: false,
      arity: 0),
  SurgeAction.dumpProfileEffective: CommandSpec(
      action: SurgeAction.dumpProfileEffective,
      argv: ['dump', 'profile', 'effective'],
      mutates: false,
      arity: 0),
  SurgeAction.dumpProfileOriginal: CommandSpec(
      action: SurgeAction.dumpProfileOriginal,
      argv: ['dump', 'profile', 'original'],
      mutates: false,
      arity: 0),
  SurgeAction.watchRequest: CommandSpec(
      action: SurgeAction.watchRequest,
      argv: ['watch', 'request'],
      mutates: false,
      streaming: true,
      arity: 0),
  SurgeAction.testNetwork: CommandSpec(
      action: SurgeAction.testNetwork,
      argv: ['--raw', 'test-network'],
      mutates: false,
      arity: 0),
  // test-* need --raw to emit JSON latency results.
  SurgeAction.testPolicy: CommandSpec(
      action: SurgeAction.testPolicy,
      argv: ['--raw', 'test-policy', '{0}'],
      mutates: false,
      arity: 1),
  SurgeAction.testAllPolicies: CommandSpec(
      action: SurgeAction.testAllPolicies,
      argv: ['--raw', 'test-all-policies'],
      mutates: false,
      arity: 0),
  SurgeAction.testGroup: CommandSpec(
      action: SurgeAction.testGroup,
      argv: ['--raw', 'test-group', '{0}'],
      mutates: false,
      arity: 1),
  SurgeAction.testPolicyBandwidth: CommandSpec(
      action: SurgeAction.testPolicyBandwidth,
      argv: ['test-policy-bandwidth', '{0}', '{1}'],
      mutates: false,
      streaming: true,
      arity: 2),
  SurgeAction.addTempRule: CommandSpec(
      action: SurgeAction.addTempRule, argv: ['add-temp-rule', '{0}'], mutates: true, arity: 1),
  SurgeAction.delTempRule: CommandSpec(
      action: SurgeAction.delTempRule, argv: ['del-temp-rule', '{0}'], mutates: true, arity: 1),
  SurgeAction.updateTempRule: CommandSpec(
      action: SurgeAction.updateTempRule,
      argv: ['update-temp-rule', '{0}', '{1}'],
      mutates: true,
      arity: 2),
  SurgeAction.flushTempRule: CommandSpec(
      action: SurgeAction.flushTempRule, argv: ['flush-temp-rule'], mutates: true, arity: 0),
  SurgeAction.externalResourceList: CommandSpec(
      action: SurgeAction.externalResourceList,
      argv: ['--raw', 'external-resource', 'list'],
      mutates: false,
      arity: 0),
  SurgeAction.externalResourceUpdate: CommandSpec(
      action: SurgeAction.externalResourceUpdate,
      argv: ['external-resource', 'update', '{0}'],
      mutates: true,
      arity: 1),
  SurgeAction.externalResourceUpdateAll: CommandSpec(
      action: SurgeAction.externalResourceUpdateAll,
      argv: ['external-resource', 'update', 'all'],
      mutates: true,
      arity: 0),
  SurgeAction.flushDns:
      CommandSpec(action: SurgeAction.flushDns, argv: ['flush', 'dns'], mutates: true, arity: 0),
  SurgeAction.diagnostics: CommandSpec(
      action: SurgeAction.diagnostics, argv: ['diagnostics'], mutates: false, arity: 0),
  SurgeAction.kill:
      CommandSpec(action: SurgeAction.kill, argv: ['kill', '{0}'], mutates: true, arity: 1),
  SurgeAction.setLogLevel: CommandSpec(
      action: SurgeAction.setLogLevel, argv: ['set-log-level', '{0}'], mutates: true, arity: 1),
  // `set` takes one or more `key=value` tokens. Call once per scalar update.
  SurgeAction.setEnvironment: CommandSpec(
      action: SurgeAction.setEnvironment,
      argv: ['set', '{0}'],
      mutates: true,
      arity: 1),
  SurgeAction.scriptEvaluate: CommandSpec(
      action: SurgeAction.scriptEvaluate,
      argv: ['script', 'evaluate', '{0}'],
      mutates: false,
      arity: 1),
  SurgeAction.checkProfile: CommandSpec(
      action: SurgeAction.checkProfile,
      argv: ['--check', '{0}'],
      mutates: false,
      arity: 1),
};

/// List profile files in the configured Surge config directory (plain `ls`).
String buildListProfilesCommand(String configDir) =>
    'ls -1 -- ${shellQuote(configDir)}';

final RegExp _placeholder = RegExp(r'^\{(\d+)\}$');
final RegExp _safeToken = RegExp(r'^[A-Za-z0-9_./:=-]+$');

/// POSIX single-quote a token for safe interpolation into a remote command.
String shellQuote(String token) {
  if (token.isNotEmpty && _safeToken.hasMatch(token)) return token;
  return "'${token.replaceAll("'", "'\\''")}'";
}

/// Resolve a fully-quoted command line for an action against a host profile.
/// Throws [ArgumentError] on arity mismatch (guards against missing-placeholder
/// injection).
String buildCommandLine(
  SurgeProfile profile,
  SurgeAction action, [
  List<String> args = const [],
]) {
  final spec = commandCatalog[action];
  if (spec == null) throw ArgumentError('Unknown surge action: $action');
  if (args.length != spec.arity) {
    throw ArgumentError(
      'Action "${action.name}" expects ${spec.arity} arg(s), got ${args.length}',
    );
  }

  final template = profile.argv[action] ?? spec.argv;
  final resolved = template.map((tok) {
    final m = _placeholder.firstMatch(tok);
    if (m == null) return shellQuote(tok);
    final idx = int.parse(m.group(1)!);
    return shellQuote(args[idx]);
  });

  return [shellQuote(profile.bin), ...resolved].join(' ');
}
