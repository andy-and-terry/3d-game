const SUPPORTED_LTS_MAJORS = [20, 22];

function parseMajor(version) {
  const match = /^v?(\d+)\./.exec(String(version || ''));
  return match ? Number.parseInt(match[1], 10) : null;
}

function isLtsVersion(version, release = process.release, supportedMajors = SUPPORTED_LTS_MAJORS) {
  if (release && release.lts) {
    return true;
  }

  const major = parseMajor(version);
  return major !== null && supportedMajors.includes(major);
}

function runNodeLtsCheck({
  version = process.version,
  release = process.release,
  logger = console,
  supportedMajors = SUPPORTED_LTS_MAJORS,
} = {}) {
  if (isLtsVersion(version, release, supportedMajors)) {
    return true;
  }

  logger.warn(
    `[startup] Node ${version} does not appear to be an LTS release. ` +
      `Recommended LTS majors: ${supportedMajors.join(', ')}.`,
  );
  return false;
}

if (require.main === module) {
  runNodeLtsCheck();
}

module.exports = {
  SUPPORTED_LTS_MAJORS,
  isLtsVersion,
  parseMajor,
  runNodeLtsCheck,
};
