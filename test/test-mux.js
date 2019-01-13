#!/usr/bin/env node

var assert = require('assert');
var child_process = require('child_process');
var MUX = require('../mux.js');

var TEST2_COUNT = 100000;

if (process.argv[2] === 'child') {
    console.error('subprocess OK');
    var mux = new MUX(process.stdin, process.stdout, (info, readable) => {
        if (info.type === 'end') process.exit(0);
        if (info.type === 'test1') {
            info.type += 'ret';
            var writable = mux.newSession(info);
            MUX.pipe(readable, writable);
        } else if (info.type === 'test2') {
            var count = 0;
            var paused = true;
            console.error('pause');
            readable.pause();
            readable.on('data', data => {
                assert.equal(paused, false);
                count++;
                assert(count <= TEST2_COUNT + 1);
                if (count == TEST2_COUNT) {
                    paused = true;
                    console.error('pause');
                    readable.pause();
                    setTimeout(() => {
                        console.error('resume');
                        paused = false;
                        readable.resume();
                    }, 1000);
                }
            });
            readable.on('end', () => {
                assert.equal(count, TEST2_COUNT + 1);
                var writable = mux.newSession({ type: 'test2ret' });
            });
            setTimeout(() => {
                console.error('resume');
                paused = false;
                readable.resume();
            }, 1000);
        } else {
            assert(false);
        }
    });
    return;
}

var subprocess = child_process.spawn('./test-mux.js', ['child'], { cwd: __dirname, stdio: ['pipe', 'pipe', 2] });
subprocess.on('exit', () => {
    console.error('subprocess exit');
});

var d = Buffer.from(String(Math.random()));
var e = Buffer.from(String(Math.random()));

var mux = new MUX(subprocess.stdout, subprocess.stdin, (info, readable) => {
    if (info.type === 'test1ret') {
        writable.write(e);
        readable.once('data', data => {
            assert.deepEqual(data, d);
            readable.once('data', data => {
                assert.deepEqual(data, e);
                console.error('test1 OK');
                test2();
            });
        });
    } else if (info.type === 'test2ret') {
        console.error('test2 OK');
        mux.newSession({ type: 'end' });
    } else {
        assert(false);
    }
});

// test1
var writable = mux.newSession({ type: 'test1' });
writable.write(d);

function test2() {
    var writable = mux.newSession({ type: 'test2' });
    var c = 0;
    while (c++ <= TEST2_COUNT && writable.write(d));
    writable.on('drain', () => {
        while (c++ <= TEST2_COUNT && writable.write(d));
        if (c > TEST2_COUNT) writable.end();
    });
}
