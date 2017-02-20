import { EventEmitter } from 'events';
import { parse as parseUrl } from 'url';
import { debuglog } from 'util';

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

export default class WsConnection extends EventEmitter {
  constructor() {
    super();

    this._log = debuglog('ws');

    this._socket = null;
    this._router = null;
    this._codec = null;
    this._reconnector = null;
    this._user = null;

    this._id = 0;

    this._inreq = new Map();
    this._inres = new Map();
    this._outreq = new Map();
    this._outres = new Map();

    this._interval = null;

    this._handleOpen = (e) => this._open(e);
    this._handleClose = (e) => this._close(e);
    this._handleError = (e) => this._error(e);
    this._handleMessage = (e) => this._message(e);
  }

  open() {
    this._log('Connection open');
    this._reconnector.open();

    return this;
  }

  close(code, reason) {
    this._log('Connection close %s %s', code, reason);

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

  user(value = null) {
    if (value === null) {
      return this._user;
    }

    this._user = value;
    this.emit('user', value);

    return this;
  }

  upgrade(value = null) {
    if (!this._socket) {
      return value === null ? null : this;
    }

    if (value === null) {
      return this._socket.upgradeReq;
    }

    this._socket.upgradeReq = value;
    return this;
  }

  reconnector(options = null) {
    if (options === null) {
      return this._reconnector;
    }

    const protocol = options.protocol || 'wss:';
    const url = protocol + '//' + options.host + ':' + options.port;

    this._reconnector = new Reconnector();
    this._reconnector.url(url);
    this._reconnector.class(options.class);
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
    }, duration);

    return this;
  }

  request() {
    return this._outgoing();
  }

  send(data) {
    this._log('Connection send %j', data);

    if (this._socket && this._socket.readyState === this._socket.OPEN) {
      this._socket.send(data);
    }
  }

  decoder(writer) {
    return this._codec && this._codec.decoder(writer, this) || writer;
  }

  encoder(writer) {
    return this._codec && this._codec.encoder(writer, this) || writer;
  }

  address() {
    if (!this._socket) {
      return {};
    }

    if (this._socket.upgradeReq) {
      return this._upgrade();
    }

    return this._parse();
  }

  _bindReconnector() {
    if (this._reconnector) {
      this._reconnector.on('open', this._handleOpen);
      this._reconnector.on('error', this._handleError);
    }
  }

  _unbindReconnector() {
    if (this._reconnector) {
      this._reconnector.removeListener('open', this._handleOpen);
      this._reconnector.removeListener('error', this._handleError);
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
      request.destroy(true);
    });

    this._inres.forEach((response) => {
      response.destroy(true);
    });

    this._outreq.forEach((request) => {
      request.destroy(true);
    });

    this._outres.forEach((response) => {
      response.destroy(true);
    });

    if (this._reconnector && force === false) {
      return;
    }

    this._unbindSocket();

    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }

    event.connection = this;
    this.emit('close', event);
  }

  _error(event) {
    event.connection = this;
    this.emit('error', event);
  }

  _open(event) {
    this.socket(event.socket);
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

  _checkProtocol(data, callback) {
    if (!Array.isArray(data) || data.length !== 3) {
      callback(new Error('Message has an invalid structure'));
      return;
    }

    const isRequest = (/^(GET|POST|PUT|DELETE)\s(.+)$/).test(data[0]);
    const isResponse = typeof data[0] === 'number';

    if (!isRequest && !isResponse) {
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
    if (error) {
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
    const id = Number(headers['x-id']);
    const more = Boolean(headers['x-more']);

    let request = this._inreq.get(id);
    let response = null;

    if (!request) {
      [request, response] = this._incoming(mpq, headers);
      this._router.handleRequest(request, response);
    }

    if (body !== null) {
      request.request().write(body);
    }

    if (more === false) {
      request.request().end();
    }
  }

  _response([status, headers, body]) {
    const id = Number(headers['x-id']);
    const more = Boolean(headers['x-more']);

    const response = this._outres.get(id);

    response
      .status(status)
      .headers(headers);

    if (body !== null) {
      response.write(body);
    }

    if (more === false) {
      response.end();
    }
  }

  _incoming(mpq, headers) {
    const id = headers['x-id'];

    const requestAdapter = new ServerRequestAdapter(mpq, headers)
      .connection(this);

    const responseAdapter = new ServerResponseAdapter()
      .connection(this);

    const request = new ServerRequest()
      .connection(this)
      .request(requestAdapter);

    const response = new ServerResponse()
      .connection(this)
      .response(responseAdapter);

    response.header('x-id', id);

    this._inreq.set(id, request);
    this._inres.set(id, response);

    request.once('end', () => {
      this._inreq.delete(id);
      this._log('Connection _incoming end (%s)', this._inreq.size);
    });

    response.once('finish', () => {
      this._inres.delete(id);
      this._log('Connection _incoming finish (%s)', this._inres.size);
    });

    this._log('Connection _incoming %j %j (%s, %s)', mpq, headers,
      this._inreq.size, this._inres.size);

    return [request, response];
  }

  _outgoing() {
    const id = ++this._id;

    const request = new ClientRequest()
      .connection(this)
      .header('x-id', id);

    const response = new ClientResponse()
      .connection(this)
      .request(request);

    this._outreq.set(id, request);
    this._outres.set(id, response);

    request.once('finish', () => {
      this._outreq.delete(id);
      this._log('Connection _outgoing finish (%s)', this._outreq.size);
    });

    response.once('end', () => {
      this._outres.delete(id);
      this._log('Connection _outgoing end (%s)', this._outres.size);
    });

    this._log('Connection _outgoing %s (%s, %s)', id,
      this._outreq.size, this._outres.size);

    return request;
  }

  _ping() {
    this._log('Connection _ping');

    if (this._socket && this._socket.readyState === this._socket.OPEN) {
      this._socket.ping();
    }
  }

  _parse() {
    const parsedUrl = parseUrl(this._socket.url);

    return {
      address: parsedUrl.hostname,
      port: parsedUrl.port
    };
  }

  _upgrade() {
    if (this._socket.upgradeReq.headers['x-real-ip']) {
      return {
        address: this._socket.upgradeReq.headers['x-real-ip'],
        port: this._socket.upgradeReq.headers['x-real-port']
      };
    }

    return {
      address: this._socket.upgradeReq.connection.remoteAddress,
      port: this._socket.upgradeReq.connection.remotePort
    };
  }
}
