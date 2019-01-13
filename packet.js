/*
Copyright (c) 2016-2019 rtrdprgrmr

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

'use strict';

const assert = require('assert');

function encodeUTF8(str) { // intentionally ignores surrogate pair
    var bytes = new Uint8Array(str.length * 3);
    var j = 0;
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c <= 0x007F) {
            bytes[j++] = c;
        } else if (c <= 0x07FF) {
            bytes[j++] = (0xC0 + ((c >> 6) & 0x1F));
            bytes[j++] = (0x80 + (c & 0x3F));
        } else {
            bytes[j++] = (0xE0 + ((c >> 12) & 0x0F));
            bytes[j++] = (0x80 + ((c >> 6) & 0x3F));
            bytes[j++] = (0x80 + (c & 0x3F));
        }
    }
    return bytes.slice(0, j);
}

function decodeUTF8(bytes) {
    var list = [];
    var codes = [];
    for (var i = 0; i < bytes.length; i++) {
        var o1 = bytes[i];
        if ((o1 & 0x80) === 0) {
            var c = o1;
        } else if ((o1 & 0xE0) === 0xC0) {
            var o2 = bytes[++i];
            assert.equal((o2 & 0xC0), 0x80);
            var c = ((o1 & 0x1F) << 6) + (o2 & 0x3F);
            assert(c > 0x007F);
        } else {
            assert.equal((o1 & 0xF0), 0xE0);
            var o2 = bytes[++i];
            assert.equal((o2 & 0xC0), 0x80);
            var o3 = bytes[++i];
            assert.equal((o3 & 0xC0), 0x80);
            var c = ((o1 & 0x0F) << 12) + ((o2 & 0x3F) << 6) + (o3 & 0x3F);
            assert(c > 0x07FF);
        }
        codes.push(c);
        if (codes.length >= 1024) {
            list.push(String.fromCharCode.apply(null, codes));
            codes = [];
        }
    }
    list.push(String.fromCharCode.apply(null, codes));
    return list.join('');
}

class PacketSocket extends require('events').EventEmitter {
    constructor(input, output) {
        super();
        this.input = input;
        this.output = output;
        input.on('error', err => console.error('debug', err.stack));
        output.on('error', err => console.error('debug', err.stack));
        //input.on('error', err => err);
        //output.on('error', err => err);
        output.on('drain', () => this.emit('drain'));

        var seg = 1;
        var expecting = 4;
        var remain = 4;
        var pending = [];
        var header;
        input.on('data', data => {
            while (true) {
                if (!data) {
                    if (remain > 0) return;
                    data = Buffer.alloc(0);
                } else if (data.length <= remain) {
                    pending.push(data);
                    remain -= data.length;
                    if (remain > 0) return;
                    data = null;
                } else {
                    pending.push(data.slice(0, remain));
                    data = data.slice(remain);
                }
                if (pending.length === 1) {
                    var d = pending[0];
                } else {
                    var d = Buffer.concat(pending);
                }
                pending = [];
                assert.equal(d.length, expecting);
                if (seg === 1) {
                    seg = 2;
                    remain = expecting = d.readUInt32LE(0);
                } else if (seg === 2) {
                    var packet = JSON.parse(decodeUTF8(d));
                    header = packet.header;
                    seg = 3;
                    remain = expecting = packet.length;
                    if (remain == null) {
                        this.emit('packet', header);
                        seg = 1;
                        remain = expecting = 4;
                    }
                } else {
                    assert.equal(seg, 3);
                    this.emit('packet', header, d);
                    seg = 1;
                    remain = expecting = 4;
                }
            }
        });
    }

    write(header, data) {
        var { output } = this;
        var packet = { header };
        if (data) packet.length = data.length;
        var d = encodeUTF8(JSON.stringify(packet));
        var header0 = Buffer.alloc(4);
        header0.writeUInt32LE(d.length, 0);
        output.write(header0);
        var r = output.write(d);
        if (data) {
            var r = output.write(data);
        }
        return r;
    }
}

module.exports = PacketSocket;
