#!/usr/bin/env node

/*
Copyright (c) 2016-2019 rtrdprgrmr

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

'use strict';

const agent_host = process.argv[2] || "localhost";
const agent_path = process.argv[3] || "sshproxy/agent.js";
const local_port = +process.argv[4] || 8080;

var net = require('net')
var http = require('http')
var url = require('url')
var assert = require('assert')
var child_process = require('child_process');
var MUX = require('./mux');

var subprocess = child_process.spawn(`ssh`, [agent_host, agent_path], { cwd: __dirname, stdio: ['pipe', 'pipe', 2] });
var mux = new MUX(subprocess.stdout, subprocess.stdin, (info, readable) => {
    if (info.type === 'http-res') {
        handle_http_res(info, readable);
    }
    if (info.type === 'connect-res') {
        handle_connect_res(info, readable);
    }
});
var sessions = {};

function newSession() {
    do {
        var id = Math.floor(Math.random() * 100000000);
    } while (sessions[id]);
    var sess = { id };
    sessions[id] = sess;
    return sess;
}

function handle_http(req, res) {
    console.log(req.url);
    var sess = newSession();
    sess.req = req;
    sess.res = res;
    var obj = url.parse(req.url);
    var writable = mux.newSession({
        type: 'http-req',
        id: sess.id,
        method: req.method,
        path: obj.path,
        host: obj.hostname,
        port: obj.port || 80,
        headers: req.headers,
    });
    MUX.pipe(req, writable);
    req.on('error', () => writable.end());
}

function handle_http_res(info, readable) {
    var { id, statusCode, statusMessage, headers } = info;
    var sess = sessions[id];
    if (!sess) return;
    delete sessions[id];
    var { res } = sess;
    res.writeHead(statusCode, statusMessage, headers);
    MUX.pipe(readable, res);
}

function handle_connect(req, sock, head) {
    console.log('CONNECT ' + req.url);
    var sess = newSession();
    sess.sock = sock;
    var obj = url.parse('http://' + req.url);
    var writable = mux.newSession({
        type: 'connect-req',
        id: sess.id,
        host: obj.hostname,
        port: obj.port || 80,
    });
    if (head) writable.write(head);
    MUX.pipe(sock, writable);
    sock.on('error', () => writable.end());
}

function handle_connect_res(info, readable) {
    var { id } = info;
    var sess = sessions[id];
    if (!sess) return;
    delete sessions[id];
    var { sock } = sess;
    sock.write("HTTP/1.1 200 Connection established\r\n\r\n");
    MUX.pipe(readable, sock);
}

var server = http.createServer(handle_http);
server.on('connect', handle_connect);
server.listen(local_port);

server.on('error', err => {
    console.error(err);
});
