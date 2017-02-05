import { EventEmitter } from 'events';
import { parse as parseUrl } from 'url';

import {
  ServerRequest,
  ServerResponse,
  Writer
} from '@scola/api-http';

import { ScolaError } from '@scola/error';
import ClientRequest from './client-request';
import ClientResponse from './client-response';
import ServerRequestAdapter from './server-request-adapter';
import ServerResponseAdapter from './server-response-adapter';

export default class WsConnection extends EventEmitter {
  constructor() {
    super();

    this._socket = null;
    this._router = null;
    this._codec = null;
    this._user = null;
    this._auto = true;

    this._id = 0;

    this._inreq = {};
    this._inres = {};
    this._outreq = {};
    this._outres = {};

    this._interval = null;

    this._handleClose = (e) => this._close(e);
    this._handleError = (e) => this._error(e);
    this._handleMessage = (e) => this._message(e);
  }

  open(event) {
    this.socket(event.socket);
    return this;
  }

  close(code, reason) {
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

    if (this._socket) {
      this._unbindSocket();
    }

    this._socket = value;
    this._bindSocket();

    this.emit('socket', value);
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
    return this;
  }

  upgrade(value = null) {
    if (value === null) {
      return this._socket.upgradeReq;
    }

    this._socket.upgradeReq = value;
    return this;
  }

  auto(value = null) {
    if (value === null) {
      return this._auto;
    }

    this._auto = value;
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
    const [request] = this._outgoing();
    return request;
  }

  send(data) {
    if (this._socket.readyState !== this._socket.OPEN) {
      return;
    }

    this._socket.send(data);
  }

  decoder(writer) {
    return this._codec && this._codec.decoder(writer, this) || writer;
  }

  encoder(writer) {
    return this._codec && this._codec.encoder(writer, this) || writer;
  }

  address() {
    let address = null;
    let port = null;

    if (this._socket.upgradeReq) {
      if (this._socket.upgradeReq.headers['x-real-ip']) {
        address = this._socket.upgradeReq.headers['x-real-ip'];
        port = this._socket.upgradeReq.headers['x-real-port'];
      } else {
        address = this._socket.upgradeReq.connection.remoteAddress;
        port = this._socket.upgradeReq.connection.remotePort;
      }
    } else {
      const parsedUrl = parseUrl(this._socket.url);
      address = parsedUrl.hostname;
      port = parsedUrl.port;
    }

    return {
      address,
      port
    };
  }

  _bindSocket() {
    this._socket.addEventListener('close', this._handleClose);
    this._socket.addEventListener('error', this._handleError);
    this._socket.addEventListener('message', this._handleMessage);
  }

  _unbindSocket() {
    this._socket.removeEventListener('close', this._handleClose);
    this._socket.removeEventListener('error', this._handleError);
    this._socket.removeEventListener('message', this._handleMessage);
  }

  _close(event, force = false) {
    Object.keys(this._inreq).forEach((id) => {
      this._inreq[id].destroy(true);
    });

    Object.keys(this._inres).forEach((id) => {
      this._inres[id].destroy(true);
    });

    Object.keys(this._outreq).forEach((id) => {
      this._outreq[id].destroy(true);
    });

    Object.keys(this._outres).forEach((id) => {
      this._outres[id].destroy(true);
    });

    if (this._auto === false && force === false) {
      return;
    }

    if (this._socket) {
      this._unbindSocket();
    }

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
    event.connection = this;
    this.emit('open', event);
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

    const isRequest = (/^(GET|POST|PUT|DELETE|SUB|PUB)\s(.+)$/).test(data[0]);
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
      this.close(1002);
      this.emit('error',
        new ScolaError('400 invalid_protocol ' + error.message));
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

    let request = this._inreq[id];
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

    const response = this._outres[id];

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

    this._inreq[id] = request;
    this._inres[id] = response;

    request.once('end', () => {
      delete this._inreq[id];
    });

    response.once('finish', () => {
      delete this._inres[id];
    });

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

    this._outreq[id] = request;
    this._outres[id] = response;

    request.once('finish', () => {
      delete this._outreq[id];
    });

    response.once('end', () => {
      delete this._outres[id];
    });

    return [request, response];
  }

  _ping() {
    if (this._socket.readyState === this._socket.OPEN) {
      this._socket.ping();
    }
  }
}
