// Reads a terminal stream on stdin and writes [[ms since start, chunk], …] as JSON to stdout.
// Usage: script -q /dev/null <command> < /dev/null | node stamp.mjs > run.json
const start = Date.now();
const chunks = [];
process.stdin.on('data', d => chunks.push([Date.now() - start, d.toString('utf8')]));
process.stdin.on('end', () => process.stdout.write(JSON.stringify(chunks)));
