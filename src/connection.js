import { parse as parseUrl } from 'url';
import EventEmitter from 'events';
import { ServerRequest, ServerResponse } from '@scola/api-http';
import { ScolaError } from '@scola/error';

import ClientRequest from './client-request';
import ClientResponse from './client-response';
import ServerRequestAdapter from './server-request-adapter';
import ServerResponseAdapter from './server-response-adapter';

export default class Connection extends EventEmitter {
  constructor() {
    super();

    this._socket = null;
    this._router = null;
    this._codec = null;
    this._options = {
      idHeader: 'x-id'
    };

    this._id = 0;
    this._requests = {};

    this._handleClose = (e) => this._close(e);
    this._handleError = (e) => this._error(e);
    this._handleMessage = (e) => this._message(e);
    this._handleOpen = (e) => this._open(e);
  }

  close(code, reason) {
    this._socket.close(code, reason);

    this._close({
      code,
      reason,
      final: true
    });

    return this;
  }

  socket(socket) {
    if (typeof socket === 'undefined') {
      return this._socket;
    }

    this._socket = socket;
    this._bindSocket();

    return this;
  }

  router(router) {
    if (typeof router === 'undefined') {
      return this._router;
    }

    this._router = router;
    return this;
  }

  codec(codec) {
    if (typeof codec === 'undefined') {
      return this._codec;
    }

    this._codec = codec;
    return this;
  }

  options(options) {
    if (typeof options === 'undefined') {
      return this._options;
    }

    Object.assign(this._options, options);
    return this;
  }

  address() {
    return this._socket.upgradeReq ?
      this._socket.upgradeReq.connection.remoteAddress :
      parseUrl(this._socket.url).hostname;
  }

  port() {
    return this._socket.upgradeReq ?
      this._socket.upgradeReq.connection.remotePort :
      parseUrl(this._socket.url).port;
  }

  request(request) {
    if (typeof request === 'undefined') {
      return new ClientRequest()
        .connection(this);
    }

    this._id += 1;
    this._requests[this._id] = request;

    request.header(this._options.idHeader, this._id);
    return this;
  }

  getMaxListeners() {
    if (typeof this._maxListeners === 'undefined') {
      return EventEmitter.defaultMaxListeners;
    }

    return this._maxListeners;
  }

  _bindSocket() {
    this._socket.addEventListener('close', this._handleClose);
    this._socket.addEventListener('error', this._handleError);
    this._socket.addEventListener('message', this._handleMessage);
    this._socket.addEventListener('open', this._handleOpen);
  }

  _unbindSocket() {
    this._socket.removeListener('close', this._handleClose);
    this._socket.removeListener('error', this._handleError);
    this._socket.removeListener('message', this._handleMessage);
    this._socket.removeListener('open', this._handleOpen);
  }

  _close(event) {
    if (event.final) {
      this._unbindSocket();
    }

    this.emit('close', event, this);
  }

  _error(event) {
    this.emit('error', event, this);
  }

  _open(event) {
    this.emit('open', event, this);
  }

  _message(event) {
    const Decoder = this._codec.Decoder;
    const decoder = new Decoder();

    decoder.once('error', (error) => {
      decoder.removeAllListeners();
      this.close(1003);
      this.emit('error', error);
    });

    decoder.once('data', (data) => {
      decoder.removeAllListeners();

      this._checkProtocol(data, (error) => {
        if (error) {
          this.close(1002);
          this.emit('error', new ScolaError('400 invalid_protocol ' +
            error.message));
          return;
        }

        if (typeof data[0] === 'string') {
          this._request(data);
        } else {
          this._response(data);
        }
      });
    });

    decoder.end(event.data);
  }

  _request(data) {
    const requestAdapter = new ServerRequestAdapter(this, ...data);
    const responseAdapter = new ServerResponseAdapter(this);

    const request = new ServerRequest(requestAdapter);
    const response = new ServerResponse(responseAdapter);

    if (request.header(this._options.idHeader)) {
      response.header(this._options.idHeader,
        request.header(this._options.idHeader));
    }

    this._router.handleRequest(request, response);
  }

  _response([status, headers, body]) {
    const response = new ClientResponse()
      .connection(this)
      .status(status)
      .headers(headers)
      .body(body);

    if (response.header(this._options.idHeader)) {
      const id = Number(response.header(this._options.idHeader));

      if (this._requests[id]) {
        this._requests[id].handleResponse(response);
        delete this._requests[id];
      }
    }
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
