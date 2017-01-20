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
    this._open(event);

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

    this._interval = setInterval(() => this._socket.ping(), duration);
    return this;
  }

  request() {
    const request = this._createOutgoing();

    this._id += 1;
    this._outgoing[this._id] = request;
    request.header(this._header, this._id);

    return request;
  }

  send(data, callback) {
    if (this._socket.readyState !== this._socket.OPEN) {
      callback(new ScolaError('500 invalid_socket'));
      return;
    }

    this._socket.send(data, callback);
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
    if (this._socket.removeEventListener) {
      this._socket.removeEventListener('close', this._handleClose);
      this._socket.removeEventListener('error', this._handleError);
      this._socket.removeEventListener('message', this._handleMessage);
    } else {
      this._socket.removeListener('close', this._handleClose);
      this._socket.removeListener('error', this._handleError);
      this._socket.removeListener('message', this._handleMessage);
    }
  }

  _close(event, force = false) {
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

    if (!this._incoming[id]) {
      const [request, response] = this._createIncoming(mpq, headers, body);
      this._incoming[id] = request;

      response.header(this._header, id);
      this._router.handleRequest(request, response);
    }

    if (body !== null) {
      this._incoming[id].request().write(body);
      return;
    }

    this._incoming[id].end();
    delete this._incoming[id];
  }

  _response([status, headers, body]) {
    const id = Number(headers[this._header]);
    const request = this._outgoing[id];

    if (body === null) {
      delete this._outgoing[id];
    }

    request.handleResponse(status, headers, body);
  }

  _createIncoming(mpq, headers, body) {
    const requestAdapter = new ServerRequestAdapter(mpq, headers, body)
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
    return new ClientRequest().connection(this);
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
}
