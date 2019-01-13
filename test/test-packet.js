var assert = require('assert');
var child_process = require('child_process');
var PacketSocket = require('../packet.js');

if (process.argv[2] === 'child') {
    console.error('subprocess OK');
    var stream = new PacketSocket(process.stdin, process.stdout);
    stream.on('packet', (header, data) => {
        if (header.end) process.exit(0);
        header.cmd += 'ret';
        stream.write(header, data);
    });
    return;
}

var subprocess = child_process.fork('./test-packet.js', ['child'], { cwd: __dirname, stdio: ['pipe', 'pipe', 2, 'ipc'] });
subprocess.on('exit', () => {
    console.error('subprocess exit');
});

var stream = new PacketSocket(subprocess.stdout, subprocess.stdin);
var d = Buffer.from(String(Math.random()));
stream.write({ cmd: 'test1' }, d);
stream.write({ cmd: 'test2' }, null);
stream.write({ cmd: 'test3' }, Buffer.alloc(0));
stream.on('packet', (header, data) => {
    switch (header.cmd) {
        case 'test1ret':
            assert.deepEqual(data, d);
            console.error('test1 OK');
            return;
        case 'test2ret':
            assert.equal(data, undefined);
            console.error('test2 OK');
            return;
        case 'test3ret':
            assert.equal(data.length, 0);
            console.error('test3 OK');
            stream.write({ end: true });
            return;
        default:
            assert(false);
    }
});
