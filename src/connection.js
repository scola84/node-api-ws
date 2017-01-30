import { EventEmitter } from 'events';
import { parse as parseUrl } from 'url';

import {
  ServerRequest,
  ServerResponse,
  Writer
} from '@scola/api-http';

import { ScolaError } from '@scola/error';
import ClientRequest from './client-request';
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
    this._header = 'x-id';

    this._id = 0;

    this._incoming = {};
    this._outgoing = {};

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

    if (this._auto) {
      this._open({});
    }

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

  header(value = null) {
    if (value === null) {
      return this._header;
    }

    this._header = value;
    return this;
  }

  ping(duration) {
    if (this._interval) {
      clearInterval(this._interval);
    }

    this._interval = setInterval(() => this._ping(), duration);
    return this;
  }

  request() {
    const request = this._createOutgoing();

    this._id += 1;
    this._outgoing[this._id] = request;
    request.header(this._header, this._id);

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
    const error = new ScolaError('500 invalid_socket');

    Object.keys(this._outgoing).forEach((id) => {
      this._outgoing[id].destroy(error);
      delete this._outgoing[id];
    });

    Object.keys(this._incoming).forEach((id) => {
      this._incoming[id].request.destroy(error);
      this._incoming[id].response.destroy(error);
      delete this._incoming[id];
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
    const id = Number(headers[this._header]);
    const more = Boolean(headers['x-more']);

    let { request, response } = this._incoming[id] || {};

    if (!request) {
      [request, response] = this._createIncoming(mpq, headers);
      this._incoming[id] = { request, response };

      response.header(this._header, id);
      this._router.handleRequest(request, response);
    }

    if (body !== null) {
      request.request().write(body);
    }

    if (more === false) {
      request.request().end();
      delete this._incoming[id];
    }
  }

  _response([status, headers, body]) {
    const id = Number(headers[this._header]);
    const more = Boolean(headers['x-more']);

    const request = this._outgoing[id];

    if (more === false) {
      delete this._outgoing[id];
    }

    if (request) {
      request.handleResponse(status, headers, body);
    }
  }

  _createIncoming(mpq, headers) {
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

    return [request, response];
  }

  _createOutgoing() {
    return new ClientRequest()
      .connection(this);
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

  _ping() {
    if (this._socket.readyState === this._socket.OPEN) {
      this._socket.ping();
    }
  }
}
