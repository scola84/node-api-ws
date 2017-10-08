import { EventEmitter } from 'events';
import { parse as parseUrl } from 'url';
import { debuglog } from 'util';
import pick from 'lodash-es/pick';

import {
  ServerRequest,
  ServerResponse,
  Writer
} from '@scola/api-http';

import { Reconnector } from '@scola/websocket';

import { ScolaError } from '@scola/error';
import ClientRequest from './client-request';
import ClientResponse from './client-response';
import ServerRequestAdapter from './server-request-adapter';
import ServerResponseAdapter from './server-response-adapter';

const mpqTest = (/^(GET|HEAD|PATCH|POST|PUT|DELETE)\s(.+)$/);

export default class WsConnection extends EventEmitter {
  constructor() {
    super();

    this._log = debuglog('ws');

    this._socket = null;
    this._router = null;
    this._codec = null;
    this._reconnector = null;

    this._key = null;
    this._user = null;

    this._address = null;
    this._headers = {};
    this._id = 0;

    this._dictionary = {};

    this._inreq = new Map();
    this._inres = new Map();
    this._outreq = new Map();
    this._outres = new Map();

    this._interval = null;

    this._handleClose = (e) => this._close(e);
    this._handleError = (e) => this._error(e);
    this._handleMessage = (e) => this._message(e);
    this._handleOpen = (e) => this._open(e);
    this._handleReconnect = (e) => this._reconnect(e);
  }

  open() {
    this._log('Connection open');
    this._reconnector.open();

    return this;
  }

  close(code, reason) {
    this._log('Connection close code=%s reason=%s', code, reason);

    if (this._socket) {
      this._socket.close(code, reason);
    }

    this._close({
      code,
      reason
    }, true);

    return this;
  }

  socket(value = null) {
    if (value === null) {
      return this._socket;
    }

    this._log('Connection socket');

    this._unbindSocket();
    this._socket = value;
    this._bindSocket();

    this.emit('open', value);
    return this;
  }

  router(value = null) {
    if (value === null) {
      return this._router;
    }

    this._router = value;
    return this;
  }

  codec(value = null) {
    if (value === null) {
      return this._codec;
    }

    this._codec = value;
    return this;
  }

  dictionary(value = null) {
    if (value === null) {
      return this._dictionary;
    }

    this._dictionary = value;
    return this;
  }

  headers(value = null) {
    if (value === null) {
      return this._headers;
    }

    this._headers = value;
    return this;
  }

  key(value = null) {
    if (value === null) {
      return this._key;
    }

    this._key = value;
    return this;
  }

  user(value = null) {
    if (value === null) {
      return this._user;
    }

    value = value === false ? null : value;

    this._user = value;
    return this;
  }

  upgrade(value) {
    if (typeof value.headers !== 'undefined') {
      this._headers = pick(value.headers, [
        'upgrade',
        'user-agent'
      ]);
    }

    if (typeof value.key !== 'undefined') {
      this._key = value.key;
    }

    if (typeof value.user !== 'undefined') {
      this._user = value.user;
    }

    this._address = this._parseUpgrade(value);
    return this;
  }

  reconnector(options = null) {
    if (options === null) {
      return this._reconnector;
    }

    const protocol = options.protocol || 'wss:';
    const host = options.host || 'localhost';
    const path = options.path || '';
    const port = options.port || '';

    const url =
      protocol +
      '//' + host +
      ':' + port +
      path;

    this._reconnector = new Reconnector();
    this._reconnector.url(url);
    this._reconnector.factory(options.factory);
    this._reconnector.attempts(options.attempts);
    this._reconnector.factor(options.factor);

    this._bindReconnector();
    return this;
  }

  ping(duration) {
    if (this._interval) {
      clearInterval(this._interval);
    }

    this._interval = setInterval(() => {
      this._ping();
    }, duration * 1000);

    return this;
  }

  request() {
    return this._outgoing();
  }

  send(data, callback = () => {}) {
    this._log('Connection send data=%j', data);

    if (this.connected() === false) {
      callback(new ScolaError('500 invalid_socket'));
      return;
    }

    this._socket.send(data);
  }

  decoder(writer, source) {
    return this._codec &&
      this._codec.decoder(writer, this, source) ||
      writer;
  }

  encoder(writer, target) {
    return this._codec &&
      this._codec.encoder(writer, this, target) ||
      writer;
  }

  address() {
    if (this._socket === null) {
      return {};
    }

    if (this._address === null) {
      this._address = this._parseUrl();
    }

    return this._address;
  }

  connected() {
    return this._socket !== null &&
      this._socket.readyState === this._socket.OPEN;
  }

  translate(headers, read = false) {
    const translated = Object.assign({}, headers);

    Object.keys(this._dictionary).forEach((key) => {
      const entry = this._dictionary[key];

      if (read === false) {
        if (typeof headers[key] === 'undefined') {
          return;
        }

        if (!entry.values) {
          translated[entry.name] = headers[key];
          delete translated[key];
          return;
        }

        translated[entry.name] = entry.values[headers[key]];
        delete translated[key];
        return;
      }

      if (typeof headers[entry.name] === 'undefined') {
        return;
      }

      if (typeof entry.values === 'undefined') {
        translated[key] = headers[entry.name];
        delete translated[entry.name];
        return;
      }

      Object.keys(entry.values).forEach((key2) => {
        if (headers[entry.name] === entry.values[key2]) {
          translated[key] = key2;
          delete translated[entry.name];
        }
      });
    });

    return translated;
  }

  _bindReconnector() {
    if (this._reconnector) {
      this._reconnector.setMaxListeners(this._reconnector.getMaxListeners() + 1);
      this._reconnector.on('open', this._handleOpen);
      this._reconnector.on('reconnect', this._handleReconnect);
    }
  }

  _unbindReconnector() {
    if (this._reconnector) {
      this._reconnector.setMaxListeners(this._reconnector.getMaxListeners() - 1);
      this._reconnector.removeListener('open', this._handleOpen);
      this._reconnector.removeListener('reconnect', this._handleReconnect);
    }
  }

  _bindSocket() {
    if (this._socket) {
      this._socket.addEventListener('close', this._handleClose);
      this._socket.addEventListener('error', this._handleError);
      this._socket.addEventListener('message', this._handleMessage);
    }
  }

  _unbindSocket() {
    if (this._socket) {
      this._socket.removeEventListener('close', this._handleClose);
      this._socket.removeEventListener('error', this._handleError);
      this._socket.removeEventListener('message', this._handleMessage);
    }
  }

  _close(event, force = false) {
    this._inreq.forEach((request) => {
      request.destroy();
    });

    this._inres.forEach((response) => {
      response.destroy();
    });

    this._outreq.forEach((request) => {
      request.destroy();
    });

    this._outres.forEach((response) => {
      response.destroy();
    });

    if (this._reconnector && force === false) {
      return;
    }

    event.connection = this;
    this.emit('close', event);

    this._unbindSocket();

    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  _error(event) {
    event.connection = this;
    this.emit('error', event);
  }

  _message(event) {
    const writer = new Writer();
    const decoder = this.decoder(writer);

    decoder.once('data', (data) => {
      this._checkProtocol(data, (error) => {
        this._handleCheck(error, data);
      });
    });

    writer.end(event.data);
  }

  _open(event) {
    this.socket(event.socket);
  }

  _reconnect(event) {
    event.connection = this;
    this.emit('close', event);
  }

  _checkProtocol(data, callback) {
    if (Array.isArray(data) === false || data.length !== 3) {
      callback(new Error('Message has an invalid structure'));
      return;
    }

    const isRequest = mpqTest.test(data[0]);
    const isResponse = typeof data[0] === 'number';

    if (isRequest === false && isResponse === false) {
      callback(new Error('Message identifier is invalid: ' + data[0]));
      return;
    }

    if (data[1] === null || typeof data[1] !== 'object') {
      callback(new Error('Message headers are invalid'));
      return;
    }

    callback(null, data);
  }

  _handleCheck(error, data) {
    if (error instanceof Error === true) {
      error = new ScolaError('400 invalid_protocol ' + error.message);

      this.close(1002);
      this.emit('error', error);

      return;
    }

    if (typeof data[0] === 'string') {
      this._request(data);
    } else {
      this._response(data);
    }
  }

  _request([mpq, headers, body]) {
    this._log('Connection _request mpq=%s headers=%j body=%j',
      mpq, headers, body);

    headers = this.translate(headers, true);

    let request = this._inreq.get(headers['Message-ID']) || null;
    let response = this._inres.get(headers['Message-ID']) || null;

    if (request === null) {
      [request, response] = this._incoming(mpq, headers);
      this._router.handleRequest(request, response);
    } else if (body === null && headers.Connection === 'keep-alive') {
      request.headers(headers);
      this._router.handleRequest(request, response);
    }

    if (body !== null) {
      request.request().write(body);
    }

    if (headers.Connection !== 'keep-alive') {
      request.request().end();
    }
  }

  _response([status, headers, body]) {
    this._log('Connection _response status=%s headers=%j body=%j',
      status, headers, body);

    headers = this.translate(headers, true);

    if (this._outres.has(headers['Message-ID']) === false) {
      return;
    }

    const response = this._outres.get(headers['Message-ID']);
    const emit = response.status() === null;

    response
      .status(status)
      .headers(headers);

    if (emit === true) {
      response
        .request()
        .emit('response', response);
    }

    if (body !== null) {
      response.write(body);
    }

    if (headers.Connection !== 'keep-alive') {
      response.end();
    }
  }

  _incoming(mpq, headers) {
    const id = headers['Message-ID'];

    const requestAdapter = new ServerRequestAdapter(mpq, headers)
      .connection(this);

    const responseAdapter = new ServerResponseAdapter()
      .connection(this);

    const request = new ServerRequest()
      .codec(false)
      .connection(this);

    const response = new ServerResponse()
      .codec(false)
      .connection(this);

    requestAdapter.request(request);
    responseAdapter.response(response);

    response.header('Message-ID', id);

    this._inreq.set(id, request);
    this._inres.set(id, response);

    request.once('end', () => {
      this._inreq.delete(id);
      this._log('Connection _incoming end #inreq=%d',
        this._inreq.size);
    });

    response.once('finish', () => {
      this._inres.delete(id);
      this._log('Connection _incoming finish #inres=%d',
        this._inres.size);
    });

    this._log('Connection _incoming mpq=%s headers=%j #inreq=%d, #inres=%d)',
      mpq, headers, this._inreq.size, this._inres.size);

    return [request, response];
  }

  _outgoing() {
    const id = ++this._id;

    const request = new ClientRequest()
      .connection(this)
      .header('Message-ID', id);

    const response = new ClientResponse()
      .connection(this)
      .request(request);

    this._outreq.set(id, request);
    this._outres.set(id, response);

    request.once('finish', () => {
      this._outreq.delete(id);
      this._log('Connection _outgoing finish #outreq=%d',
        this._outreq.size);
    });

    response.once('end', () => {
      this._outres.delete(id);
      this._log('Connection _outgoing end #outres=%d',
        this._outres.size);
    });

    response.resume();

    this._log('Connection _outgoing id=%s #outreq=%d #outres=%d',
      id, this._outreq.size, this._outres.size);

    return request;
  }

  _ping() {
    this._log('Connection _ping');

    const ping =
      this._socket !== null &&
      this._socket.readyState === this._socket.OPEN;

    if (ping) {
      this._socket.ping();
    }
  }

  _parseUrl() {
    const parsedUrl = parseUrl(this._socket.url);

    return {
      address: parsedUrl.hostname,
      port: parsedUrl.port
    };
  }

  _parseUpgrade(upgrade) {
    let address = upgrade.headers['x-real-ip'];
    let port = upgrade.headers['x-real-port'];

    if (typeof address === 'undefined') {
      address = upgrade.connection.remoteAddress;
      port = upgrade.connection.remotePort;
    }

    return {
      address,
      port
    };
  }
}
