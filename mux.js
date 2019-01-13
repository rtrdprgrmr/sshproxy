/*
Copyright (c) 2016-2019 rtrdprgrmr

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

'use strict';

var assert = require('assert')
var PacketSocket = require('./packet');

function MUX(input, output, session_handler) {
    if (!this) {
        return new MUX(input, output);
    }

    var packetSocket = new PacketSocket(input, output);
    var readableMap = new Map();
    var writableMap = new Map();

    this.newSession = function(info) {
        var writable = new Writable();
        pswrite({ type: 'new', id: writable.id, info });
        return writable;
    }

    packetSocket.on('packet', (header, data) => {
        var { type, id, info } = header;
        switch (type) {
            case 'new':
                var readable = new Readable(id);
                session_handler(info, readable);
                return;
            case 'data':
                var readable = readableMap.get(id);
                if (readable) readable.x_write(data);
                return;
            case 'paused':
                var writable = writableMap.get(id);
                if (writable) writable.x_paused();
                return;
            case 'resumed':
                var writable = writableMap.get(id);
                if (writable) writable.x_resumed();
                return;
            case 'end':
                var readable = readableMap.get(id);
                if (readable) readable.x_end(data);
                return;
        }
    });

    class Readable extends require('events').EventEmitter {
        constructor(id) {
            super();
            readableMap.set(id, this);
            this.id = id;
            this.a_pending = null;
        }
        pause() {
            if (this.a_pending) return;
            this.a_pending = [];
            pswrite({ type: 'paused', id: this.id });
        }
        resume() {
            if (!this.a_pending) return;
            while (this.a_pending.length) {
                var data = this.a_pending.shift();
                if (data === 'end') {
                    this.emit('end');
                } else {
                    this.emit('data', data);
                }
            }
            this.a_pending = null;
            pswrite({ type: 'resumed', id: this.id });
        }
        x_write(data) {
            if (this.a_pending) {
                this.a_pending.push(data);
            } else {
                this.emit('data', data);
            }
        }
        x_end() {
            if (this.a_pending) {
                this.a_pending.push('end');
            } else {
                this.emit('end');
            }
            readableMap.delete(this.id);
        }
    }

    class Writable extends require('events').EventEmitter {
        constructor() {
            super();
            do {
                var id = Math.floor(Math.random() * 100000000);
            }
            while (writableMap.get(id));
            writableMap.set(id, this);
            this.id = id;
            this.a_resumed = true;
        }
        write(data) {
            pswrite({ type: 'data', id: this.id }, data);
            return this.a_resumed && drained;
        }
        end() {
            pswrite({ type: 'end', id: this.id });
            writableMap.delete(this.id);
        }
        x_paused() {
            this.a_resumed = false;
        }
        x_resumed() {
            if (this.a_resumed) return;
            this.a_resumed = true;
            if (drained) this.emit('drain');
        }
    }

    var drained = true;
    packetSocket.on('drain', () => {
        if (drained) return;
        drained = true;
        for (var writable of writableMap.values()) {
            if (writable.a_resumed) writable.emit('drain');
        }
    });

    function pswrite(header, data) {
        if (!packetSocket.write(header, data)) {
            drained = false;
        }
    }

}

function pipe(src, dst) {
    src.on('data', data => {
        assert(data);
        if (!dst.write(data)) {
            src.pause();
        }
    });
    dst.on('drain', () => {
        src.resume();
    });
    src.on('end', () => {
        dst.end();
    });
}

MUX.pipe = pipe;
module.exports = MUX;
