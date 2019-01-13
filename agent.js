#!/usr/bin/env node

/*
Copyright (c) 2016-2019 rtrdprgrmr

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

'use strict';

var net = require('net')
var http = require('http')
var url = require('url')
var assert = require('assert')
var MUX = require('./mux');

var mux = new MUX(process.stdin, process.stdout, (info, readable) => {
    if (info.type === 'http-req') {
        handle_http_req(info, readable);
    }
    if (info.type === 'connect-req') {
        handle_connect_req(info, readable);
    }
});

function handle_http_req(info, readable) {
    var req = http.request({
            method: info.method,
            path: info.path,
            host: info.host,
            port: info.port,
            headers: info.headers,
        },
        res => {
            var writable = mux.newSession({
                type: 'http-res',
                id: info.id,
                statusCode: res.statusCode,
                statusMessage: res.statusMessage,
                headers: res.headers,
            });
            MUX.pipe(res, writable);
            res.on('error', () => writable.end());
        });
    req.on('error', err => {
        var writable = mux.newSession({
            type: 'http-res',
            id: info.id,
            statusCode: 400,
            statusMessage: String(err),
        });
        writable.end();
    });
    MUX.pipe(readable, req);
}

function handle_connect_req(info, readable) {
    readable.pause();
    var writable;
    var sock = net.connect(info.port, info.host, () => {
        writable = mux.newSession({
            type: 'connect-res',
            id: info.id,
        });
        MUX.pipe(sock, writable);
        MUX.pipe(readable, sock);
        readable.resume();
    });
    sock.on('error', err => {
        if (writable) {
            writable.end();
            return;
        }
        writable = mux.newSession({
            type: 'connect-res',
            id: info.id,
        });
        writable.end();
    });
}
