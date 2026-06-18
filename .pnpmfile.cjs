// Drop ssh2's optional `cpu-features` native add-on. It only provides a CPU
// AES-NI perf hint; ssh2 runs fine without it. Removing it avoids compiling a
// native module during packaging (electron-builder's @electron/rebuild), which
// keeps offline/CI packaging working and cuts the native-build surface to just
// keytar (which ships prebuilt binaries).
function readPackage(pkg) {
  if (pkg.name === "ssh2" && pkg.optionalDependencies) {
    delete pkg.optionalDependencies["cpu-features"];
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
