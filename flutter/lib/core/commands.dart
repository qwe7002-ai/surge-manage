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
  SurgeAction.version:
      CommandSpec(action: SurgeAction.version, argv: ['--version'], mutates: false, arity: 0),
  SurgeAction.status:
      CommandSpec(action: SurgeAction.status, argv: ['status', '--json'], mutates: false, arity: 0),
  SurgeAction.start:
      CommandSpec(action: SurgeAction.start, argv: ['start'], mutates: true, arity: 0),
  SurgeAction.stop:
      CommandSpec(action: SurgeAction.stop, argv: ['stop'], mutates: true, arity: 0),
  SurgeAction.restart:
      CommandSpec(action: SurgeAction.restart, argv: ['restart'], mutates: true, arity: 0),
  SurgeAction.reload:
      CommandSpec(action: SurgeAction.reload, argv: ['reload'], mutates: true, arity: 0),
  SurgeAction.policies: CommandSpec(
      action: SurgeAction.policies, argv: ['policy', 'list', '--json'], mutates: false, arity: 0),
  SurgeAction.selectPolicy: CommandSpec(
      action: SurgeAction.selectPolicy,
      argv: ['policy', 'select', '{0}', '{1}'],
      mutates: true,
      arity: 2),
  SurgeAction.rules: CommandSpec(
      action: SurgeAction.rules, argv: ['rule', 'list', '--json'], mutates: false, arity: 0),
  SurgeAction.traffic:
      CommandSpec(action: SurgeAction.traffic, argv: ['traffic', '--json'], mutates: false, arity: 0),
  SurgeAction.logsTail: CommandSpec(
      action: SurgeAction.logsTail,
      argv: ['log', '--follow'],
      mutates: false,
      streaming: true,
      arity: 0),
  SurgeAction.configPath:
      CommandSpec(action: SurgeAction.configPath, argv: ['config', 'path'], mutates: false, arity: 0),
  SurgeAction.configShow:
      CommandSpec(action: SurgeAction.configShow, argv: ['config', 'show'], mutates: false, arity: 0),
  SurgeAction.test:
      CommandSpec(action: SurgeAction.test, argv: ['test', '{0}'], mutates: false, arity: 1),
};

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
